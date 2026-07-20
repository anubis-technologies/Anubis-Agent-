/**
 * Anubis Agent — DOM response watcher v3.
 *
 * v3 fixes:
 * - Parse errors (invalid JSON tool calls) are resolved immediately without
 *   hitting EXECUTE_TOOL_CALL, breaking the infinite retry loop.
 * - Forward-slash path auto-correction: Windows paths with unescaped
 *   backslashes are auto-fixed (C:\Users\x → C:/Users/x) and the corrected
 *   call is re-dispatched once. If the corrected call still fails, we report
 *   the original error without retrying again.
 * - Signatures for parse-errored calls include a counter suffix so the AI
 *   can legitimately retry (with different wording) without being blocked.
 */

import { extractToolCalls } from './tool-parser';
import type { ToolCall, ToolDescriptor } from '../types';

export interface DomResponseWatcherOptions {
  getAssistantElements: () => HTMLElement[];
  getDescriptors: () => ToolDescriptor[];
  quietMs?: number;
  providerLabel: string;
  onStepStart?:    (stepId: string, call: ToolCall) => void;
  onStepResolved?: (stepId: string, ok: boolean, detail: string | undefined, call: ToolCall) => void;
}

// ── path sanitiser ────────────────────────────────────────────────────────────
// When an AI produces `"C:\Users\hhotc\Downloads\file.txt"` inside JSON,
// the backslashes aren't escaped → JSON.parse fails. We try converting them
// to forward slashes (PowerShell accepts both) and re-parse.
function tryFixWindowsPaths(rawTag: string): string | null {
  try {
    // Replace un-escaped backslashes inside double-quoted JSON strings.
    // Strategy: replace \ that is NOT already preceded by a backslash.
    const fixed = rawTag.replace(/\\(?!["\\\/bfnrtu])/g, '/');
    if (fixed === rawTag) return null; // nothing changed
    return fixed;
  } catch {
    return null;
  }
}

// ── parse-error message builder ───────────────────────────────────────────────
function buildParseErrorGuidance(call: ToolCall): string {
  const msg = call.parseError?.message ?? 'Invalid tool call format.';
  return [
    msg,
    '',
    'To fix: use forward slashes in file paths, e.g.:',
    '  "command": "New-Item -Path \'C:/Users/hhotc/Downloads/file.txt\' -Value \'hello\' -Force"',
    'Or escape each backslash with another backslash:',
    '  "command": "New-Item -Path \\"C:\\\\Users\\\\hhotc\\\\Downloads\\\\file.txt\\" -Value \\"hello\\" -Force"',
  ].join('\n');
}

export function startDomResponseWatcher(options: DomResponseWatcherOptions): () => void {
  const quietMs = options.quietMs ?? 800;

  // Global across all elements — prevents re-firing after result is injected
  const globalSeenSignatures = new Set<string>();

  // Per-element settle timers + last text (to detect stream-end)
  const settleTimers  = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
  const lastSeenText  = new WeakMap<HTMLElement, string>();

  // Track which elements we've already fully processed (stream done + parsed)
  const processedEls  = new WeakSet<HTMLElement>();

  // Tracks in-flight dispatches to avoid double-dispatch on overlapping mutations
  const inFlight      = new Set<string>();

  // Counter for parse-error signatures (so each new error attempt gets a unique sig)
  let parseErrorCounter = 0;

  // ── XML block hider ──────────────────────────────────────────────────────────
  // After tool calls are detected in an assistant element, surgically hide only
  // the XML tag blocks in that element's text — leaving normal prose untouched.
  // This keeps the tool-step panel's anchor and the surrounding text visible.
  const TOOL_XML_HIDE_ATTR = 'data-anubis-xml-hidden';
  const KNOWN_TOOL_TAGS_RE = /shell_exec|shell_status|web_search|web_fetch|read_file|write_file|list_dir|bash|python|tool_call|function_call|invoke|create_file|delete_file|move_file|copy_file|run_command|execute|cmd|powershell|terminal/;

  function hideXmlBlocksInElement(el: HTMLElement, calls: ToolCall[]) {
    if (el.getAttribute(TOOL_XML_HIDE_ATTR)) return;
    el.setAttribute(TOOL_XML_HIDE_ATTR, 'true');

    // Build set of raw XML strings to hide
    const rawBlocks = new Set<string>();
    for (const call of calls) {
      if (call.raw) rawBlocks.add(call.raw.trim());
    }
    if (!rawBlocks.size) return;

    // Walk all text nodes inside the element and wrap matching XML in hidden spans
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) textNodes.push(node);

    for (const textNode of textNodes) {
      const content = textNode.textContent ?? '';
      // Check if this text node contains XML-like tool tags
      if (!KNOWN_TOOL_TAGS_RE.test(content)) continue;
      if (!/<[a-z][a-z0-9_]*[\s>]/.test(content)) continue;

      // Replace with: text before XML | hidden span | text after XML
      const parent = textNode.parentNode;
      if (!parent) continue;

      // Build a fragment replacing the text node
      const frag = document.createDocumentFragment();
      let remaining = content;

      // Match all XML blocks
      const xmlRe = /<([a-z][a-z0-9_]*)>([\s\S]*?)<\/\1>|<([a-z][a-z0-9_]*)\s*\/>/g;
      let lastIndex = 0;
      let m: RegExpExecArray | null;
      let hadMatch = false;
      while ((m = xmlRe.exec(content)) !== null) {
        const tag = m[1] ?? m[3];
        if (!KNOWN_TOOL_TAGS_RE.test(tag)) continue;
        hadMatch = true;
        // Text before this match
        if (m.index > lastIndex) {
          frag.appendChild(document.createTextNode(content.slice(lastIndex, m.index)));
        }
        // Hidden span for the XML block
        const span = document.createElement('span');
        span.setAttribute('data-anubis-xml-block', tag);
        span.style.cssText = 'display:none!important';
        span.textContent = m[0];
        frag.appendChild(span);
        lastIndex = m.index + m[0].length;
      }
      if (!hadMatch) continue;
      // Remaining text after last match
      if (lastIndex < content.length) {
        frag.appendChild(document.createTextNode(content.slice(lastIndex)));
      }
      parent.replaceChild(frag, textNode);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  function getUserMessageCount(): number {
    return document.querySelectorAll(
      '[data-message-author-role="user"], user-query, .user-query',
    ).length;
  }

  function scheduleCheck(el: HTMLElement) {
    const t = settleTimers.get(el);
    if (t) clearTimeout(t);
    settleTimers.set(el, setTimeout(() => settle(el), quietMs));
  }

  function settle(el: HTMLElement) {
    const text = el.innerText ?? el.textContent ?? '';

    const prev = lastSeenText.get(el);
    lastSeenText.set(el, text);
    if (prev !== undefined && prev !== text) {
      scheduleCheck(el);
      return;
    }

    if (!text.trim()) return;
    if (processedEls.has(el)) return;

    const descriptors = options.getDescriptors();
    const calls = extractToolCalls(text, { descriptors });
    if (!calls.length) return;

    const msgIdx = getUserMessageCount();

    let dispatched = false;
    for (const call of calls) {
      // ── Parse error path ────────────────────────────────────────────────────
      if (call.parseError) {
        // Each parse error gets a unique counter so identical broken calls from
        // subsequent AI messages are each reported once (not silently swallowed).
        const sig = `parse-error::${++parseErrorCounter}::${call.name}`;
        if (globalSeenSignatures.has(sig)) continue;
        globalSeenSignatures.add(sig);
        dispatched = true;

        const stepId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        options.onStepStart?.(stepId, call);

        // Try to auto-fix Windows path backslash issues before giving up
        const fixedRaw = call.raw ? tryFixWindowsPaths(call.raw) : null;
        if (fixedRaw && fixedRaw !== call.raw) {
          const fixedCalls = extractToolCalls(fixedRaw, { descriptors });
          const fixedCall = fixedCalls.find(c => c.name === call.name && !c.parseError);
          if (fixedCall) {
            // The auto-fix worked — execute the corrected call silently
            inFlight.add(sig);
            chrome.runtime
              .sendMessage({ type: 'EXECUTE_TOOL_CALL', payload: fixedCall })
              .then((result: any) => {
                inFlight.delete(sig);
                const ok     = result && typeof result === 'object' ? Boolean(result.ok) : true;
                const detail = result && typeof result === 'object'
                  ? (result.detail ?? result.summary ?? result.output)
                  : undefined;
                options.onStepResolved?.(stepId, ok, typeof detail === 'string' ? detail : detail != null ? JSON.stringify(detail) : undefined, call);
              })
              .catch((err) => {
                inFlight.delete(sig);
                options.onStepResolved?.(stepId, false, err instanceof Error ? err.message : String(err), call);
              });
            continue;
          }
        }

        // Auto-fix didn't work — report the parse error directly without calling EXECUTE_TOOL_CALL
        // This breaks the loop: the AI gets a clear explanation of exactly how to fix the syntax.
        options.onStepResolved?.(stepId, false, buildParseErrorGuidance(call), call);
        continue;
      }

      // ── Normal execution path ────────────────────────────────────────────────
      const raw = call.raw ?? JSON.stringify(call.payload ?? {});
      const sig = `${msgIdx}::${call.name}::${raw}`;

      if (globalSeenSignatures.has(sig)) continue;
      if (inFlight.has(sig)) continue;

      globalSeenSignatures.add(sig);
      inFlight.add(sig);
      dispatched = true;
      dispatchToolCall(call, sig);
    }

    if (dispatched) {
      processedEls.add(el);
      // Surgically hide only the XML tool blocks from the assistant element,
      // keeping surrounding normal text and the panel's DOM anchor intact.
      const allCalls = extractToolCalls(text, { descriptors });
      hideXmlBlocksInElement(el, allCalls);
    }
  }

  function dispatchToolCall(call: ToolCall, sig: string) {
    const stepId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    options.onStepStart?.(stepId, call);

    chrome.runtime
      .sendMessage({ type: 'EXECUTE_TOOL_CALL', payload: call })
      .then((result: any) => {
        inFlight.delete(sig);
        const ok     = result && typeof result === 'object' ? Boolean(result.ok) : true;
        const detail = result && typeof result === 'object'
          ? (result.detail ?? result.summary ?? result.output)
          : undefined;
        options.onStepResolved?.(stepId, ok, typeof detail === 'string' ? detail : detail != null ? JSON.stringify(detail) : undefined, call);
      })
      .catch((err) => {
        inFlight.delete(sig);
        options.onStepResolved?.(stepId, false, err instanceof Error ? err.message : String(err), call);
      });
  }

  function scanAll() {
    for (const el of options.getAssistantElements()) {
      if (!processedEls.has(el)) scheduleCheck(el);
    }
  }

  const observer = new MutationObserver(scanAll);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  scanAll();

  return () => observer.disconnect();
}
