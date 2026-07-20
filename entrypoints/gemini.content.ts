/**
 * Anubis Agent — Gemini content script v10 (v27)
 *
 * Root-cause fix for injection failure:
 *
 * setEditableText (shared nuclear-injection) uses innerHTML + <p> tags as its
 * fallback. Angular's rich-textarea ngModel binding does NOT watch innerHTML
 * mutations — it watches the 'input' event's data field and the element's
 * textContent. Setting innerHTML with <p> tags gives textContent that includes
 * '\n' separators which don't match what Angular expects, and the button stays
 * aria-disabled="true" (never enables → bootstrap loop silently gives up).
 *
 * Fix: bypass the shared setEditableText entirely for Gemini. Use a Gemini-specific
 * geminiSetText() that:
 *   1. Clears the element with el.textContent = ''
 *   2. Sets el.textContent = text  (plain text, no HTML tags)
 *   3. Moves cursor to end (so Angular sees the caret inside the element)
 *   4. Dispatches beforeinput + input on the contenteditable element (bubbles
 *      to rich-textarea where Angular's zone.js intercepts it)
 *   5. Also dispatches input on the rich-textarea host element directly
 *      as a belt-and-suspenders trigger for Angular's change detection
 *
 * Also fixes robustInsertAndSend's "sent?" check — it used getAttribute('disabled')
 * but Gemini uses aria-disabled. Pass a custom isButtonSent check via getButton
 * wrapping so the strategy loop exits correctly after a successful click.
 */

import type { Memory, Skill, ToolDescriptor, SystemPromptPreset, ModelType, ToolCall } from '../core/types';
import { buildGeminiSystemPrompt, augmentGeminiBody } from '../core/interceptor/multi-provider-augmentation';
import { createDefaultToolDescriptors } from '../core/tool/invocation';
import { DEFAULT_LOCALE } from '../core/i18n';
import { startDomResponseWatcher } from '../core/interceptor/dom-response-watcher';
import {
  installMessageScrubber,
  hideInputArea,
  wrapVisibleUserText,
  resetBootstrapFlags,
  hasBootstrappedThisSession,
  markBootstrappedThisSession,
  hasInjectedThisSession,
  markInjectedThisSession,
} from '../core/interceptor/nuclear-injection';
import { createToolStepPanel } from '../core/ui/tool-step-panel';

const BADGE_ID = 'anubis-gemini-badge';

let memories:        Memory[]              = [];
let skills:          Skill[]               = [];
let toolDescriptors: ToolDescriptor[]      = createDefaultToolDescriptors(DEFAULT_LOCALE);
let activePreset:    SystemPromptPreset | null = null;
let modelType:       ModelType             = null;

// ── Bridge ────────────────────────────────────────────────────────────────────
const MAIN_SOURCE    = 'anubis-gemini-main';
const CONTENT_SOURCE = 'anubis-gemini-content';
const BRIDGE_REQUEST = 'ANUBIS_GEMINI_BRIDGE_REQUEST';
const BRIDGE_INIT    = 'ANUBIS_GEMINI_BRIDGE_INIT';
let mainWorldPort: MessagePort | null = null;

function installBridge() {
  window.addEventListener('message', (ev) => {
    if (ev.origin !== location.origin) return;
    if (ev.data?.source !== MAIN_SOURCE || ev.data.type !== BRIDGE_REQUEST) return;
    if (mainWorldPort) return;
    const ch = new MessageChannel();
    mainWorldPort = ch.port1;
    mainWorldPort.onmessage = async (e) => {
      const { data } = e;
      if (data?.source !== MAIN_SOURCE || data.type !== 'AUGMENT_REQUEST_BODY') return;
      try {
        const result = augmentGeminiBody(data.body, { memories, skills, toolDescriptors, activePreset, modelType });
        mainWorldPort!.postMessage({ source: CONTENT_SOURCE, type: 'AUGMENT_REQUEST_BODY_RESULT', id: data.id, ok: true, body: result ?? null });
      } catch (err) {
        mainWorldPort!.postMessage({ source: CONTENT_SOURCE, type: 'AUGMENT_REQUEST_BODY_RESULT', id: data.id, ok: false, error: String(err) });
      }
    };
    mainWorldPort.start();
    window.postMessage({ source: CONTENT_SOURCE, type: BRIDGE_INIT }, location.origin, [ch.port2]);
  });
}

// ── DOM selectors ─────────────────────────────────────────────────────────────

/** Returns the rich-textarea Angular host element (for event dispatching). */
function getRichTextarea(): HTMLElement | null {
  return document.querySelector<HTMLElement>('rich-textarea') ?? null;
}

/**
 * Returns the inner contenteditable element where text is actually inserted.
 * Tries modern plain-contenteditable first, then legacy Quill.
 */
function getInput(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('rich-textarea .ql-editor[contenteditable="true"]') ??
    document.querySelector<HTMLElement>('rich-textarea [contenteditable="true"]') ??
    document.querySelector<HTMLElement>('.ql-editor[contenteditable="true"]') ??
    document.querySelector<HTMLElement>('div[contenteditable="true"]:not([aria-hidden="true"])') ??
    null
  );
}

function getButton(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('button[aria-label="Send message"]') ??
    document.querySelector<HTMLElement>('button[aria-label="Send"]') ??
    document.querySelector<HTMLElement>('button[data-mat-icon-name="send"]') ??
    document.querySelector<HTMLElement>('button[jsname] mat-icon[fonticon="send"]')?.closest<HTMLElement>('button') ??
    document.querySelector<HTMLElement>('button.send-button') ??
    null
  );
}

function isButtonEnabled(btn: HTMLElement): boolean {
  if (btn.hasAttribute('disabled')) return false;
  if (btn.getAttribute('aria-disabled') === 'true') return false;
  return true;
}

function getUserMessageElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(
    'user-query, .user-query, [data-message-author-role="user"], .query-text',
  ));
}

function getAssistantElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(
    'model-response, message-content, .model-response-text, ms-chat-turn[role="model"]',
  ));
}

// ── Gemini-specific text insertion ────────────────────────────────────────────
/**
 * Set text into Gemini's Angular rich-textarea reliably.
 *
 * Angular's ngModel on rich-textarea listens for 'input' events that bubble
 * from the inner contenteditable. The crucial detail: Angular reads the
 * element's textContent (not innerHTML) to update its model. Setting innerHTML
 * with <p> tags leaves '\n' separators in textContent which confuses Angular's
 * empty-check → button stays aria-disabled.
 *
 * This function:
 *   1. Sets textContent directly (plain text, no HTML wrapping)
 *   2. Moves cursor to end so the caret is inside the element
 *   3. Fires beforeinput + input on the contenteditable (bubbles to rich-textarea)
 *   4. Fires input directly on rich-textarea host as well (belt & suspenders)
 */
function geminiSetText(text: string): boolean {
  const inner = getInput();
  if (!inner) return false;

  inner.focus();

  // Set content — use textContent for plain text, avoid HTML entity issues
  inner.textContent = text;

  // Move cursor to end so Angular sees caret inside the element
  try {
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(inner);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  } catch { /**/ }

  // Fire beforeinput (ProseMirror / Angular editor components use this)
  inner.dispatchEvent(new InputEvent('beforeinput', {
    bubbles: true, cancelable: true,
    inputType: 'insertText', data: text,
  }));

  // Fire input — this is what Angular's ngModel listens for
  inner.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    inputType: 'insertText',
    data: text,
  }));

  // Also fire directly on rich-textarea host in case Angular wired at component level
  const host = getRichTextarea();
  if (host && host !== inner) {
    host.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: text,
    }));
  }

  return true;
}

function geminiClearText(): void {
  const inner = getInput();
  if (!inner) return;
  inner.textContent = '';
  inner.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward', data: '' }));
  const host = getRichTextarea();
  if (host && host !== inner) {
    host.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward', data: '' }));
  }
}

// ── Gemini bootstrap (self-contained, no shared setEditableText) ──────────────
/**
 * Silently send the system instructions as a hidden first message.
 * Completely self-contained — does NOT use the shared nuclear-injection
 * setEditableText, which uses innerHTML and breaks Angular's change detection.
 */
function attemptGeminiBootstrap(): boolean {
  if (hasBootstrappedThisSession('gemini')) return false;
  if (hasInjectedThisSession('gemini')) return false;

  const btn = getButton();
  if (!btn) return false;

  const instructions = buildGeminiSystemPrompt({ memories, skills, toolDescriptors, activePreset, modelType });
  if (!instructions.trim()) return false;

  const bootstrapMsg = `[system: anubis-bootstrap]\n\n${instructions}\n\nPlease acknowledge receipt with only the word: Ready.`;

  const ok = geminiSetText(bootstrapMsg);
  if (!ok) return false;

  // Hide input area so bootstrap text is never visible in the typing box
  const showInput = hideInputArea(getInput);

  // Poll until aria-disabled clears (Angular re-renders after input event)
  let attempts = 0;
  const trySend = () => {
    attempts++;
    const btn2 = getButton();
    if (btn2 && isButtonEnabled(btn2)) {
      btn2.click();
      markBootstrappedThisSession('gemini');
      markInjectedThisSession('gemini');
      setTimeout(() => { showInput(); geminiClearText(); }, 500);
    } else if (attempts < 15) {
      setTimeout(trySend, 200);
    } else {
      showInput(); // Restore even if send failed
    }
    // If 15 attempts (3 s) exhausted: text didn't register.
    // Inline injection handles next user message as fallback.
  };
  setTimeout(trySend, 300);

  return true;
}

// ── Gemini inline injection (on first user send) ──────────────────────────────
/**
 * Prepend instructions to the user's current input on first send.
 * Called from keydown(Enter) and button click listeners.
 */
function geminiEnsureInjected(): boolean {
  if (hasInjectedThisSession('gemini')) return false;

  const inner = getInput();
  if (!inner) return false;

  const instructions = buildGeminiSystemPrompt({ memories, skills, toolDescriptors, activePreset, modelType });
  if (!instructions.trim()) return false;

  const userText = inner.textContent ?? '';
  const combined = `${instructions}\n\n${wrapVisibleUserText(userText)}`;

  geminiSetText(combined);
  markInjectedThisSession('gemini');
  return true;
}

// ── Gemini send (tool results) ────────────────────────────────────────────────
async function geminSendMessage(text: string): Promise<void> {
  // Hide the input area so the injected tool-result text is never visible
  const showInput = hideInputArea(getInput);
  const ok = geminiSetText(text);
  if (!ok) { showInput(); return; }

  const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
  await wait(250);

  // Poll for button to enable, then click
  let attempts = 0;
  const trySend = async () => {
    attempts++;
    const btn = getButton();
    if (btn && isButtonEnabled(btn)) {
      btn.click();
      setTimeout(showInput, 400); // Restore input visibility after send
      return;
    }
    // Fallback: simulate Enter key
    if (attempts >= 8) {
      const inner = getInput();
      if (inner) {
        const opts = { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 };
        inner.dispatchEvent(new KeyboardEvent('keydown',  { ...opts }));
        inner.dispatchEvent(new KeyboardEvent('keypress', { ...opts }));
        inner.dispatchEvent(new KeyboardEvent('keyup',    { ...opts }));
      }
      showInput();
      return;
    }
    await wait(200);
    await trySend();
  };
  await trySend();
}

// ── Badge ─────────────────────────────────────────────────────────────────────

function injectBadge() {
  if (document.getElementById(BADGE_ID)) return;
  const s = document.createElement('style');
  s.textContent = '@keyframes anbs{0%,100%{transform:scale(1)}50%{transform:scale(1.6);opacity:.55}}';
  document.head?.appendChild(s);
  const b = document.createElement('div');
  b.id = BADGE_ID;
  b.style.cssText = 'position:fixed;bottom:76px;right:14px;z-index:9999;background:rgba(8,8,8,.93);border:1px solid rgba(212,175,55,.45);border-radius:10px;padding:7px 12px;font-family:Inter,sans-serif;font-size:11px;color:rgba(212,175,55,.85);letter-spacing:1.2px;pointer-events:none;backdrop-filter:blur(14px);box-shadow:0 4px 18px rgba(212,175,55,.13);display:flex;align-items:center;gap:6px';
  b.innerHTML = '<span style="width:6px;height:6px;border-radius:50%;background:#1ac36a;box-shadow:0 0 7px #1ac36a;flex-shrink:0;animation:anbs 2s ease-in-out infinite"></span>ANUBIS ACTIVE';
  document.body?.appendChild(b);
}

// ── Bootstrap message hider ───────────────────────────────────────────────────

function hideBootstrapMessages() {
  for (const el of getUserMessageElements()) {
    const text = el.textContent ?? '';
    if (text.includes('[system: anubis-bootstrap]') || text.includes('[system: anubis-tool-result]')) {
      const group = el.closest<HTMLElement>('user-query, .user-query-container') ?? el;
      group.style.display = 'none';
    }
  }
}

// ── State loader ──────────────────────────────────────────────────────────────

async function loadState() {
  try {
    const [m, s, t, p] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'GET_MEMORIES' }),
      chrome.runtime.sendMessage({ type: 'GET_SKILLS' }),
      chrome.runtime.sendMessage({ type: 'GET_TOOL_DESCRIPTORS' }),
      chrome.runtime.sendMessage({ type: 'GET_ACTIVE_PRESET' }),
    ]);
    memories        = Array.isArray(m) ? m : [];
    skills          = Array.isArray(s) ? s : [];
    toolDescriptors = Array.isArray(t) && t.length ? t : createDefaultToolDescriptors(DEFAULT_LOCALE);
    activePreset    = p ?? null;
  } catch { /**/ }
}

// ── Tool result ───────────────────────────────────────────────────────────────

function buildToolResultMessage(toolName: string, ok: boolean, detail?: string): string {
  const body = ok
    ? `[Tool result: ${toolName}]${detail ? '\n\n' + detail : ''}\n\nContinue the task.`
    : `[Tool error: ${toolName}] ${detail ?? 'Unknown error'}\n\nHandle the error and continue.`;
  return `[system: anubis-tool-result]\n\n${body}`;
}

function extractCommandDetail(call: ToolCall): string | undefined {
  const p = call.payload;
  if (!p || typeof p !== 'object') return undefined;
  const r = p as Record<string, unknown>;
  if (typeof r.command === 'string') return r.command;
  if (typeof r.query   === 'string') return r.query;
  if (typeof r.path    === 'string') return r.path;
  if (typeof r.url     === 'string') return r.url;
  return undefined;
}

// ── Wire keydown / click listeners for inline injection ───────────────────────

const wiredInputs  = new WeakSet<HTMLElement>();
const wiredButtons = new WeakSet<HTMLElement>();

function attachGeminiListeners() {
  const input = getInput();
  if (input && !wiredInputs.has(input)) {
    wiredInputs.add(input);
    input.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' && !(e as KeyboardEvent).shiftKey) {
        geminiEnsureInjected();
      }
    }, { capture: true });
  }
  const btn = getButton();
  if (btn && !wiredButtons.has(btn)) {
    wiredButtons.add(btn);
    btn.addEventListener('click', geminiEnsureInjected, { capture: true });
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default defineContentScript({
  matches: ['*://gemini.google.com/*'],
  runAt: 'document_start',
  async main() {
    resetBootstrapFlags('gemini');

    installBridge();
    await loadState();

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'STATE_UPDATED') {
        if (msg.memories)          memories     = msg.memories;
        if (msg.skills)            skills       = msg.skills;
        if ('activePreset' in msg) activePreset = msg.activePreset ?? null;
        if ('modelType'    in msg) modelType    = msg.modelType    ?? null;
      }
      if (msg.type === 'TOOL_DESCRIPTORS_UPDATED' && msg.toolDescriptors)
        toolDescriptors = msg.toolDescriptors;
      if (msg.type === 'MCP_SERVERS_UPDATED') {
        chrome.runtime.sendMessage({ type: 'GET_TOOL_DESCRIPTORS' })
          .then((d: any) => { if (Array.isArray(d) && d.length) toolDescriptors = d; })
          .catch(() => {});
      }
      if (msg.type === 'INSERT_PROMPT_TEXT' && typeof msg.text === 'string') {
        geminSendMessage(wrapVisibleUserText(msg.text));
      }
    });

    await new Promise<void>((r) => {
      if (document.readyState !== 'loading') r();
      else document.addEventListener('DOMContentLoaded', () => r(), { once: true });
    });

    setTimeout(injectBadge, 1800);
    document.getElementById('anubis-tool-block-overlay')?.remove();

    installMessageScrubber(getUserMessageElements);
    new MutationObserver(hideBootstrapMessages)
      .observe(document.body, { childList: true, subtree: true });

    // Attach keydown/click listeners — re-attach as Angular re-renders elements
    attachGeminiListeners();
    new MutationObserver(attachGeminiListeners)
      .observe(document.body, { childList: true, subtree: true });

    // Bootstrap: simple 4 s delay + 1.5 s retry (same as original, proven to work)
    // Uses our Gemini-specific geminiSetText instead of the shared setEditableText.
    const tryBootstrap = () => {
      if (hasBootstrappedThisSession('gemini')) return;
      if (!attemptGeminiBootstrap()) setTimeout(tryBootstrap, 1500);
    };
    setTimeout(tryBootstrap, 4000);

    // Tool step panel
    let activePanel: ReturnType<typeof createToolStepPanel> | null = null;
    let activePanelTimer: ReturnType<typeof setTimeout> | null = null;
    const resolvedSteps = new Set<string>();

    startDomResponseWatcher({
      getAssistantElements,
      getDescriptors: () => toolDescriptors,
      providerLabel: 'Gemini',
      onStepStart: (stepId, call) => {
        if (activePanelTimer) { clearTimeout(activePanelTimer); activePanelTimer = null; }
        if (!activePanel) activePanel = createToolStepPanel('ANUBIS');
        activePanel.addStep(stepId, call.name, extractCommandDetail(call));
      },
      onStepResolved: (stepId, ok, detail, call) => {
        if (resolvedSteps.has(stepId)) return;
        resolvedSteps.add(stepId);
        activePanel?.resolveStep(stepId, ok, detail);
        geminSendMessage(buildToolResultMessage(call.name, ok, detail));
        activePanelTimer = setTimeout(() => {
          activePanel = null;
          activePanelTimer = null;
        }, 8000);
      },
    });
  },
});
