/**
 * Anubis Agent — Claude DOM content script v5
 * Uses buildPromptAugmentation() to inject memories + skills + MCP tool schemas
 * into Claude's system prompt field. Works for all Claude models.
 */

import type { Memory, Skill, ToolDescriptor } from '../core/types';
import { buildPromptAugmentation } from '../core/prompt/augmentation';
import { createDefaultToolDescriptors } from '../core/tool/invocation';
import { DEFAULT_LOCALE } from '../core/i18n';

const CLAUDE_PATHS = ['/api/organizations', '/api/append_message', 'claude.ai/api/'];
const BADGE_ID = 'anubis-claude-badge';

let memories:        Memory[]         = [];
let skills:          Skill[]          = [];
let toolDescriptors: ToolDescriptor[] = createDefaultToolDescriptors(DEFAULT_LOCALE);
let hookInstalled = false;

async function loadState() {
  try {
    const [m, s, t] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'GET_MEMORIES' }),
      chrome.runtime.sendMessage({ type: 'GET_SKILLS' }),
      chrome.runtime.sendMessage({ type: 'GET_TOOL_DESCRIPTORS' }),
    ]);
    memories        = Array.isArray(m) ? m : [];
    skills          = Array.isArray(s) ? s : [];
    toolDescriptors = Array.isArray(t) && t.length ? t : createDefaultToolDescriptors(DEFAULT_LOCALE);
  } catch { /* ignore */ }
}

function buildSystemPrompt(): string {
  const activeSkill = skills.find((sk) => sk.enabled !== false);
  const basePrompt  = activeSkill ? activeSkill.instructions : 'You are a helpful assistant.';
  const { augmented } = buildPromptAugmentation(basePrompt, {
    memories,
    toolDescriptors,
    locale: DEFAULT_LOCALE,
    memoryEnabled: true,
    systemPromptEnabled: true,
  });
  const markerIdx = augmented.indexOf('<!-- deepseek-pp-visible-user-prompt:start -->');
  return (markerIdx > 0 ? augmented.slice(0, markerIdx) : augmented).trim();
}

function augmentClaudeBody(bodyStr: string): string | null {
  if (!memories.length && !skills.length) return null;
  try {
    const body = JSON.parse(bodyStr);
    const systemPrompt = buildSystemPrompt();
    if (!systemPrompt) return null;

    // Claude body has `system` as a string or array of content blocks
    if (typeof body.system === 'string') {
      body.system = systemPrompt + '\n\n' + body.system;
    } else if (Array.isArray(body.system)) {
      body.system = [{ type: 'text', text: systemPrompt }, ...body.system];
    } else {
      body.system = systemPrompt;
    }
    return JSON.stringify(body);
  } catch { return null; }
}

async function fireToolCall(name: string, payload: Record<string, unknown>, raw: string) {
  try {
    await chrome.runtime.sendMessage({
      type: 'EXECUTE_TOOL_CALL',
      payload: { name, invocationName: name, payload, raw, source: { trigger: 'manual_chat' as const }, createdAt: Date.now() },
    });
  } catch { /* ignore */ }
}

function installFetchHook() {
  if (hookInstalled) return;
  hookInstalled = true;

  const origFetch = window.fetch.bind(window);
  (window as any).fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    const url =
      typeof input === 'string' ? input
      : input instanceof URL ? input.href
      : (input as Request).url;

    const isClaude = CLAUDE_PATHS.some((p) => url.includes(p));
    if (!isClaude) return origFetch(input, init);

    if (init?.method === 'POST' && typeof init?.body === 'string') {
      const aug = augmentClaudeBody(init.body);
      if (aug) init = { ...init, body: aug };
    }

    const resp = await origFetch(input, init);

    if (resp.body) {
      const [a, b] = resp.body.tee();
      const reader = a.getReader();
      const dec = new TextDecoder();
      let buf = '', proc = 0;

      (async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const re = /<([a-zA-Z_][a-zA-Z0-9_]*)>\s*(\{[\s\S]*?\})\s*<\/\1>/g;
            let m: RegExpExecArray | null;
            while ((m = re.exec(buf)) !== null) {
              if (m.index >= proc) {
                try { const p = JSON.parse(m[2]); if (p && typeof p === 'object') fireToolCall(m[1], p, m[0]); } catch { /* skip */ }
              }
            }
            proc = buf.length;
          }
        } catch { /* ignore */ }
      })();

      return new Response(b, { headers: resp.headers, status: resp.status, statusText: resp.statusText });
    }
    return resp;
  };
}

function insertText(text: string) {
  const el = document.querySelector<HTMLElement>('[contenteditable="true"].ProseMirror, div[contenteditable="true"]');
  if (!el) return;
  el.focus();
  document.execCommand('insertText', false, text);
}

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

export default defineContentScript({
  matches: ['*://claude.ai/*'],
  runAt: 'document_start',
  async main() {
    await loadState();
    installFetchHook();

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'STATE_UPDATED') {
        if (msg.memories) memories = msg.memories;
        if (msg.skills)   skills   = msg.skills;
      }
      if (msg.type === 'TOOL_DESCRIPTORS_UPDATED' && msg.toolDescriptors) toolDescriptors = msg.toolDescriptors;
      if (msg.type === 'INSERT_PROMPT_TEXT' && typeof msg.text === 'string') insertText(msg.text);
    });

    await new Promise<void>((r) => {
      if (document.readyState !== 'loading') r();
      else document.addEventListener('DOMContentLoaded', () => r(), { once: true });
    });
    setTimeout(injectBadge, 2500);
  },
});
