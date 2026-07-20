/**
 * Anubis Agent — ChatGPT content script v8
 *
 * Fixes vs v7:
 * - installMessageScrubber: hides injected prompt from rendered messages
 * - robustInsertAndSend: 5-strategy auto-send that works across machines
 * - Better system prompt: ChatGPT must write files via shell_exec, not its UI
 * - Bootstrap hidden message hides the "ANUBIS AGENT BOOTSTRAP" from UI
 * - Tool step panel injected inline near messages (not floating fixed)
 */

import type { Memory, Skill, ToolDescriptor, SystemPromptPreset, ModelType, ToolCall } from '../core/types';
import { augmentChatGPTBody, buildChatGPTSystemPrompt } from '../core/interceptor/multi-provider-augmentation';
import { createDefaultToolDescriptors } from '../core/tool/invocation';
import { DEFAULT_LOCALE } from '../core/i18n';
import { startDomResponseWatcher } from '../core/interceptor/dom-response-watcher';
import {
  wireNuclearInjection,
  installMessageScrubber,
  hideInputArea,
  containsAnubisInjection,
  wrapVisibleUserText,
  getEditableText,
  setEditableText,
  hasInjectedThisSession,
  markInjectedThisSession,
  hasBootstrappedThisSession,
  markBootstrappedThisSession,
} from '../core/interceptor/nuclear-injection';
import { robustInsertAndSend } from '../core/interceptor/auto-send';
import { createToolStepPanel } from '../core/ui/tool-step-panel';

const BADGE_ID = 'anubis-chatgpt-badge';

let memories:        Memory[]              = [];
let skills:          Skill[]              = [];
let toolDescriptors: ToolDescriptor[]     = createDefaultToolDescriptors(DEFAULT_LOCALE);
let activePreset:    SystemPromptPreset | null = null;
let modelType:       ModelType            = null;

// ── Bridge (main-world augmentation) ─────────────────────────────────────────
const MAIN_SOURCE    = 'anubis-chatgpt-main';
const CONTENT_SOURCE = 'anubis-chatgpt-content';
const BRIDGE_REQUEST = 'ANUBIS_BRIDGE_REQUEST';
const BRIDGE_INIT    = 'ANUBIS_BRIDGE_INIT';
let mainWorldPort: MessagePort | null = null;

function installBridge() {
  window.addEventListener('message', (ev) => {
    if (ev.origin !== location.origin) return;
    if (ev.data?.source !== MAIN_SOURCE || ev.data.type !== BRIDGE_REQUEST) return;
    if (mainWorldPort) return;
    const ch = new MessageChannel();
    mainWorldPort = ch.port1;
    mainWorldPort.onmessage = async (e) => {
      const data = e.data;
      if (data?.source !== MAIN_SOURCE) return;
      if (data.type !== 'AUGMENT_REQUEST_BODY') return;
      try {
        const result = augmentChatGPTBody(data.body, { memories, skills, toolDescriptors, activePreset, modelType });
        mainWorldPort!.postMessage({ source: CONTENT_SOURCE, type: 'AUGMENT_REQUEST_BODY_RESULT', id: data.id, ok: true, body: result ?? null });
      } catch (e2) {
        mainWorldPort!.postMessage({ source: CONTENT_SOURCE, type: 'AUGMENT_REQUEST_BODY_RESULT', id: data.id, ok: false, error: String(e2) });
      }
    };
    mainWorldPort.start();
    window.postMessage({ source: CONTENT_SOURCE, type: BRIDGE_INIT }, location.origin, [ch.port2]);
  });
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function getInput(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('#prompt-textarea[contenteditable="true"]') ??
    document.querySelector<HTMLElement>('#prompt-textarea') ??
    document.querySelector<HTMLElement>('div[contenteditable="true"][data-virtualkeyboard-target]') ??
    document.querySelector<HTMLElement>('div.ProseMirror[contenteditable="true"]') ??
    document.querySelector<HTMLElement>('textarea[data-id="root"]') ??
    null
  );
}

function getButton(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('button[data-testid="send-button"]:not([disabled])') ??
    document.querySelector<HTMLElement>('button[aria-label="Send prompt"]:not([disabled])') ??
    document.querySelector<HTMLElement>('button[aria-label*="Send"]:not([disabled])') ??
    null
  );
}

function getUserMessageElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-message-author-role="user"]'));
}

function getAssistantElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-message-author-role="assistant"]'));
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

// ── Bootstrap hidden message hider ────────────────────────────────────────────
// ChatGPT renders the bootstrap message as a user turn.
// We hide the entire user turn bubble if it contains the bootstrap marker.
function hideBootstrapMessages() {
  const userTurns = getUserMessageElements();
  for (const el of userTurns) {
    const text = el.textContent ?? '';
    if (text.includes('[system: anubis-bootstrap]') || containsAnubisInjection(text)) {
      // Hide the entire message group (usually wrapped in a div[data-testid="conversation-turn-*"])
      const group = el.closest<HTMLElement>('[data-testid^="conversation-turn"]') ?? el;
      group.style.display = 'none';
    }
  }
}

// ── Auto-send wrapper ─────────────────────────────────────────────────────────

function sendMessage(text: string) {
  // Hide the input area so the injected tool-result text is never visible
  const showInput = hideInputArea(getInput);
  robustInsertAndSend({
    getInput,
    getButton,
    text,
    sendDelay: 200,
  });
  // Restore after a safe window (send + clear cycle ~ 800ms)
  setTimeout(showInput, 900);
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
  } catch { /* ignore */ }
}

// ── Tool result message ───────────────────────────────────────────────────────

// Tool result messages are tagged so the scrubber hides them from the UI.
// The model still receives them; the user never sees them — identical to DeepSeek behaviour.
function buildToolResultMessage(toolName: string, ok: boolean, detail?: string): string {
  const body = ok
    ? `[Tool result: ${toolName}]${detail ? '\n\n' + detail : ''}\n\nContinue the task.`
    : `[Tool error: ${toolName}] ${detail ?? 'Unknown error'}\n\nHandle the error and continue.`;
  return `[system: anubis-tool-result]\n\n${body}`;
}

// Extract a human-readable summary from a tool call payload for the step panel.
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

// ── Main ──────────────────────────────────────────────────────────────────────

export default defineContentScript({
  matches: ['*://chatgpt.com/*', '*://chat.openai.com/*'],
  runAt: 'document_start',
  async main() {
    installBridge();
    await loadState();

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'STATE_UPDATED') {
        if (msg.memories)     memories     = msg.memories;
        if (msg.skills)       skills       = msg.skills;
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
        sendMessage(wrapVisibleUserText(msg.text));
      }
    });

    await new Promise<void>((r) => {
      if (document.readyState !== 'loading') r();
      else document.addEventListener('DOMContentLoaded', () => r(), { once: true });
    });

    setTimeout(injectBadge, 1800);
    // Remove legacy floating overlay if present from older extension version
    document.getElementById('anubis-tool-block-overlay')?.remove();

    // Install message scrubber — hides injected prompt text from rendered chat
    installMessageScrubber(getUserMessageElements);

    // Watch for bootstrap messages to hide them
    const scrubObs = new MutationObserver(hideBootstrapMessages);
    scrubObs.observe(document.body, { childList: true, subtree: true });

    wireNuclearInjection({
      sessionKey: 'chatgpt',
      buildInstructions: () => buildChatGPTSystemPrompt({ memories, skills, toolDescriptors, activePreset, modelType }),
      getInputElement: getInput,
      getSendButton: getButton,
    });

    // Panel is created fresh for each new tool-execution cycle (per assistant response),
    // so it always injects inline next to the correct message bubble.
    let activePanel: ReturnType<typeof createToolStepPanel> | null = null;
    let activePanelTimer: ReturnType<typeof setTimeout> | null = null;

    function getOrCreatePanel(): ReturnType<typeof createToolStepPanel> {
      if (!activePanel) {
        activePanel = createToolStepPanel('ANUBIS');
      }
      return activePanel;
    }

    startDomResponseWatcher({
      getAssistantElements,
      getDescriptors: () => toolDescriptors,
      providerLabel: 'ChatGPT',
      onStepStart: (stepId, call) => {
        // Cancel any pending destroy so we reuse the same panel for multi-step tasks
        if (activePanelTimer) { clearTimeout(activePanelTimer); activePanelTimer = null; }
        getOrCreatePanel().addStep(stepId, call.name, extractCommandDetail(call));
      },
      onStepResolved: (stepId, ok, detail, call) => {
        getOrCreatePanel().resolveStep(stepId, ok, detail);
        sendMessage(buildToolResultMessage(call.name, ok, detail));
        // After result is sent, schedule panel retirement so next message gets a fresh one
        activePanelTimer = setTimeout(() => {
          activePanel = null;
          activePanelTimer = null;
        }, 8000);
      },
    });
  },
});
