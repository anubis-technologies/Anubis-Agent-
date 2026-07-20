/**
 * Anubis Agent — Nuclear prompt injection v5 (v27)
 *
 * Root-cause fixes for both providers:
 *
 * CHATGPT broke because:
 *   - MutationObserver bootstrap fired doBootstrap() on every DOM mutation,
 *     spawning multiple parallel setTimeout chains before bootstrapDone was set.
 *     Race condition: several chains each tried to click the send button.
 *   - setEditableText used execCommand('insertText') which Chrome 126+ no longer
 *     fires for contenteditable (ProseMirror). ChatGPT's ProseMirror listens to
 *     'beforeinput' events, not 'input'. Text was inserted but ProseMirror's
 *     internal state didn't update → send button stayed disabled.
 *
 * GEMINI broke because:
 *   - Same MutationObserver race.
 *   - hasAttribute('disabled') never matched Gemini's aria-disabled button.
 *     (This was already fixed in v26 via isButtonEnabled, retained here.)
 *
 * FIXES:
 *   1. Bootstrap: revert to the original simple setTimeout(4s) + 1.5s retry loop.
 *      It worked. The MutationObserver approach introduced the race. The attach()
 *      observer (for wiring keydown/click) is kept — that part was correct.
 *   2. setEditableText: dispatch 'beforeinput' with inputType='insertText' BEFORE
 *      'input'. ProseMirror (ChatGPT) handles beforeinput to update its doc model,
 *      then button state updates correctly. Angular (Gemini) also handles it.
 *   3. setEditableText: DataTransfer paste simulation added as Strategy 2.
 *      This is the most reliable trigger for Angular's zone.js change detection.
 *   4. isButtonEnabled: accepts optional provider callback (Gemini passes one
 *      that checks aria-disabled). Default checks both disabled + aria-disabled.
 *   5. attemptSilentBootstrap: retry loop increased to 10 attempts × 200ms (2s).
 *      Gives Angular enough time to re-render after text insertion.
 */

export const ANUBIS_VISIBLE_START = '<!-- anubis-visible-user-prompt:start -->';
export const ANUBIS_VISIBLE_END   = '<!-- anubis-visible-user-prompt:end -->';

const SESSION_FLAG_PREFIX   = 'anubis_nuclear_injected_';
const BOOTSTRAP_SENT_PREFIX = 'anubis_bootstrap_sent_';

export interface NuclearInjectionOptions {
  sessionKey: string;
  buildInstructions: () => string;
  getInputElement: () => HTMLElement | null;
  getSendButton?: () => HTMLElement | null;
  /**
   * Optional provider-specific enabled-check for the send button.
   * When omitted, checks both HTML `disabled` attr and `aria-disabled="true"`.
   * Gemini passes its own check because it uses aria-disabled exclusively.
   */
  isButtonEnabled?: (btn: HTMLElement) => boolean;
}

// ─── sessionStorage helpers ───────────────────────────────────────────────────

function getFlag(p: string, k: string): boolean {
  try { return sessionStorage.getItem(p + k) === '1'; } catch { return false; }
}
function setFlag(p: string, k: string) {
  try { sessionStorage.setItem(p + k, '1'); } catch { /**/ }
}
function clearFlag(p: string, k: string) {
  try { sessionStorage.removeItem(p + k); } catch { /**/ }
}

export const hasInjectedThisSession      = (k: string) => getFlag(SESSION_FLAG_PREFIX,   k);
export const markInjectedThisSession     = (k: string) => setFlag(SESSION_FLAG_PREFIX,   k);
export const hasBootstrappedThisSession  = (k: string) => getFlag(BOOTSTRAP_SENT_PREFIX, k);
export const markBootstrappedThisSession = (k: string) => setFlag(BOOTSTRAP_SENT_PREFIX, k);
export const resetBootstrapFlags         = (k: string) => {
  clearFlag(SESSION_FLAG_PREFIX,   k);
  clearFlag(BOOTSTRAP_SENT_PREFIX, k);
};

// ─── button helpers ───────────────────────────────────────────────────────────

function defaultIsButtonEnabled(btn: HTMLElement): boolean {
  if (btn.hasAttribute('disabled')) return false;
  if (btn.getAttribute('aria-disabled') === 'true') return false;
  return true;
}

// ─── editable element helpers ─────────────────────────────────────────────────

export function getEditableText(el: HTMLElement): string {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el.value;
  const text = el.innerText ?? el.textContent ?? '';
  return text.replace(/^\s*\n\s*$/, '').trim() === '' ? '' : text;
}

/**
 * Set text into any editable element in a way that triggers framework change detection.
 *
 * Three strategies, tried in order:
 *
 * 1. beforeinput + input events (works for ProseMirror / ChatGPT and Angular / Gemini)
 *    ProseMirror intercepts 'beforeinput' to update its doc. Angular zone.js
 *    intercepts 'input' to run change detection. We fire both.
 *
 * 2. DataTransfer paste simulation (best for Angular zone.js)
 *    Angular's (paste) handler runs inside NgZone → triggers CD reliably.
 *
 * 3. innerHTML + compositionend (last resort for stubborn frameworks)
 */
export function setEditableText(el: HTMLElement, text: string) {
  // ── textarea / input ──────────────────────────────────────────────────────
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const proto  = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter?.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  // ── contenteditable ───────────────────────────────────────────────────────
  el.focus();
  // Select everything first so strategies replace rather than append
  try {
    const sel = window.getSelection();
    if (sel) {
      const r = document.createRange();
      r.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  } catch { /**/ }

  // Strategy 1: beforeinput → execCommand → input
  // 'beforeinput' with insertText is what ProseMirror and modern frameworks use.
  let succeeded = false;
  try {
    // Fire beforeinput first so ProseMirror / Tiptap update their internal state
    el.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true, cancelable: true,
      inputType: 'insertText', data: text,
    }));
    // execCommand still works for most contenteditable in Chrome 2025 when paired
    // with beforeinput (the browser skips its own execCommand path but the event fired)
    document.execCommand('selectAll', false);
    const inserted = document.execCommand('insertText', false, text);
    if (inserted) {
      const got = (el.textContent ?? '').replace(/\n$/, '');
      if (got.includes(text.slice(0, 30)) || got === text.replace(/\n$/, '')) {
        succeeded = true;
      }
    }
  } catch { /**/ }

  if (!succeeded) {
    // Strategy 2: DataTransfer paste — Angular zone.js intercepts paste reliably
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      // Clear first
      document.execCommand('selectAll', false);
      document.execCommand('delete', false);
      const pasted = el.dispatchEvent(new ClipboardEvent('paste', {
        bubbles: true, cancelable: true, clipboardData: dt,
      }));
      if (pasted) {
        const got = (el.textContent ?? '').replace(/\n$/, '');
        if (got.includes(text.slice(0, 30)) || got === text.replace(/\n$/, '')) {
          succeeded = true;
        }
      }
    } catch { /**/ }
  }

  if (!succeeded) {
    // Strategy 3: innerHTML + multiple events
    el.innerHTML = text
      ? `<p>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '</p><p>')}</p>`
      : '<p><br></p>';
    el.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true, cancelable: true, inputType: 'insertText', data: text,
    }));
    el.dispatchEvent(new InputEvent('input', {
      bubbles: true, inputType: 'insertText', data: text,
    }));
    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: text }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Always fire a trailing 'input' event and move cursor to end
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  moveCursorToEnd(el);
}

function moveCursorToEnd(el: HTMLElement) {
  try {
    const sel = window.getSelection();
    if (!sel) return;
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
  } catch { /**/ }
}

// ─── marker helpers ───────────────────────────────────────────────────────────

export function wrapVisibleUserText(userText: string): string {
  return `${ANUBIS_VISIBLE_START}\n${userText}\n${ANUBIS_VISIBLE_END}`;
}

export function extractVisibleText(text: string): string | null {
  const start = text.indexOf(ANUBIS_VISIBLE_START);
  if (start === -1) return null;
  const contentStart = start + ANUBIS_VISIBLE_START.length;
  const end = text.indexOf(ANUBIS_VISIBLE_END, contentStart);
  if (end === -1) return null;
  return text.slice(contentStart, end).replace(/^\n/, '').replace(/\n$/, '');
}

export function containsAnubisInjection(text: string): boolean {
  return (
    text.includes(ANUBIS_VISIBLE_START) ||
    text.includes('[system: anubis-tool-result]') ||
    text.includes('[system: anubis-bootstrap]') ||
    text.includes('anubis-bootstrap') ||
    text.includes('<!-- anubis-')
  );
}

// ─── input-area hider ─────────────────────────────────────────────────────────
// During auto-sends (bootstrap, tool results) we hide the input container so
// the injected text is never visible in the typing box.

const HIDDEN_INPUT_ATTR  = 'data-anubis-input-hidden';
let   inputHideStyleEl: HTMLStyleElement | null = null;

function ensureInputHideStyle() {
  if (inputHideStyleEl && document.head.contains(inputHideStyleEl)) return;
  inputHideStyleEl = document.createElement('style');
  inputHideStyleEl.id = 'anubis-input-hide-style';
  inputHideStyleEl.textContent = `
    [${HIDDEN_INPUT_ATTR}] { visibility: hidden !important; opacity: 0 !important; }
  `;
  document.head?.appendChild(inputHideStyleEl);
}

/**
 * Find the closest scrollable/form container around the input element to hide.
 * For ChatGPT we hide the form element that wraps the textarea.
 * For Gemini we hide the rich-textarea host.
 * We walk up max 6 levels to find a wrapper that looks like an input area
 * without hiding the whole page.
 */
function findInputContainer(el: HTMLElement): HTMLElement {
  // ChatGPT: the form wrapping #prompt-textarea
  const form = el.closest<HTMLElement>('form');
  if (form) return form;

  // Gemini: the rich-textarea component host
  const richTextarea = el.closest<HTMLElement>('rich-textarea');
  if (richTextarea) return richTextarea.parentElement ?? richTextarea;

  // Generic fallback: walk up max 6 levels
  let node: HTMLElement | null = el;
  for (let i = 0; i < 6; i++) {
    const parent = node?.parentElement;
    if (!parent) break;
    const tag = parent.tagName.toLowerCase();
    if (['main', 'body', 'html', 'section', 'article'].includes(tag)) break;
    const role = parent.getAttribute('role');
    if (role === 'main' || role === 'complementary' || role === 'navigation') break;
    node = parent;
  }
  return node ?? el;
}

export function hideInputArea(getInputElement: () => HTMLElement | null): (() => void) {
  ensureInputHideStyle();
  const el = getInputElement();
  if (!el) return () => {};
  const container = findInputContainer(el);
  container.setAttribute(HIDDEN_INPUT_ATTR, 'true');
  return () => container.removeAttribute(HIDDEN_INPUT_ATTR);
}

// ─── assistant XML scrubber ───────────────────────────────────────────────────
// ─── message scrubber ─────────────────────────────────────────────────────────
// Removes injected system-prompt text from user message elements while keeping
// the element in place with all its original styles — so the user's message
// appears in the normal site bubble, not a plain-text clone.

const SCRUBBED_ATTR    = 'data-anubis-scrubbed';
const CLEAN_CLONE_ATTR = 'data-anubis-clean';

function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Patterns that mark system-injected text we want to strip from user messages
const SYSTEM_STRIP_PATTERNS: RegExp[] = [
  // Full system prompt block: everything up to and including visible markers
  new RegExp(
    `[\\s\\S]*?${escRe(ANUBIS_VISIBLE_START)}\\n?`,
    'g',
  ),
  new RegExp(
    `\\n?${escRe(ANUBIS_VISIBLE_END)}[\\s\\S]*`,
    'g',
  ),
  // Standalone tool-result / bootstrap markers (no visible-user-text wrapper)
  /\[system: anubis-(?:bootstrap|tool-result)\][\s\S]*/g,
  /<!-- anubis-[\s\S]*?-->/g,
];

function stripSystemText(raw: string): string {
  // If the visible markers are present, extract only what's between them
  const visible = extractVisibleText(raw);
  if (visible !== null) return visible;
  // Otherwise strip any leftover system tags
  let out = raw;
  for (const re of SYSTEM_STRIP_PATTERNS) {
    re.lastIndex = 0;
    out = out.replace(re, '');
  }
  return out.trim();
}

export function installMessageScrubber(getUserMessageElements: () => HTMLElement[]) {
  const scrubbed = new WeakSet<HTMLElement>();

  function scrubAll() {
    for (const el of getUserMessageElements()) scrubElement(el);
  }

  function scrubElement(el: HTMLElement) {
    if (scrubbed.has(el)) return;
    const raw = el.innerText ?? el.textContent ?? '';
    if (!containsAnubisInjection(raw)) return;
    scrubbed.add(el);

    const clean = stripSystemText(raw);

    if (clean.trim()) {
      // Surgically rewrite text nodes to remove system content.
      // This keeps the element's original DOM structure and site styles intact
      // so the user's message appears in the normal native bubble.
      rewriteTextNodes(el, raw, clean);
      el.setAttribute(SCRUBBED_ATTR, 'true');
    } else {
      // Entire element was system-only (bootstrap echo) — hide it
      const group = (
        el.closest<HTMLElement>('[data-testid^="conversation-turn"]') ??
        el.closest<HTMLElement>('user-query, .user-query-container') ??
        el
      );
      group.style.display = 'none';
      group.setAttribute(SCRUBBED_ATTR, 'true');
    }
  }

  const obs = new MutationObserver(scrubAll);
  obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  scrubAll();
  return () => obs.disconnect();
}

/**
 * Walk all text nodes inside `el` and replace their combined content with
 * `cleanText`, preserving the element's DOM structure and styles.
 *
 * Strategy: find the deepest text-carrying node, set it to the clean text,
 * and blank out all other text nodes. This handles both ChatGPT's ProseMirror
 * structure (<p> children) and Gemini's flat structure.
 */
function rewriteTextNodes(el: HTMLElement, _rawText: string, cleanText: string) {
  // Collect all text nodes
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let n: Text | null;
  while ((n = walker.nextNode() as Text | null)) nodes.push(n);

  if (!nodes.length) {
    // No text nodes at all — just set textContent
    el.textContent = cleanText;
    return;
  }

  // Find the text node with the most content (most likely the user text host)
  let bestNode = nodes[0];
  for (const node of nodes) {
    if ((node.textContent?.length ?? 0) > (bestNode.textContent?.length ?? 0)) {
      bestNode = node;
    }
  }

  // Set the best node to the clean text, blank out the rest
  bestNode.textContent = cleanText;
  for (const node of nodes) {
    if (node !== bestNode) node.textContent = '';
  }
}

// ─── inline injection (on first user send) ────────────────────────────────────

export function ensureInstructionsInjected(options: NuclearInjectionOptions): boolean {
  if (hasInjectedThisSession(options.sessionKey)) return false;
  const el = options.getInputElement();
  if (!el) return false;
  const instructions = options.buildInstructions();
  if (!instructions.trim()) return false;
  const userText = getEditableText(el);
  const combined = `${instructions}\n\n${wrapVisibleUserText(userText)}`.trim();
  setEditableText(el, combined);
  markInjectedThisSession(options.sessionKey);
  return true;
}

// ─── silent bootstrap ─────────────────────────────────────────────────────────

function attemptSilentBootstrap(options: NuclearInjectionOptions): boolean {
  if (hasBootstrappedThisSession(options.sessionKey)) return false;
  if (hasInjectedThisSession(options.sessionKey)) return false;

  const el  = options.getInputElement();
  const btn = options.getSendButton?.();
  // Both input AND button must be present. For ChatGPT, getButton() uses
  // :not([disabled]) so it returns null when empty — that's correct, it means
  // the page isn't ready yet. We return false and the caller retries.
  if (!el || !btn) return false;

  const currentText = getEditableText(el).trim();
  if (currentText.length > 0) return false;

  const instructions = options.buildInstructions();
  if (!instructions.trim()) return false;

  const checkEnabled = options.isButtonEnabled ?? defaultIsButtonEnabled;

  const bootstrapMsg =
    `[system: anubis-bootstrap]\n\n${instructions}\n\nPlease acknowledge receipt with only the word: Ready.`;

  // Hide the input area so the injected bootstrap text is never visible
  const showInput = hideInputArea(options.getInputElement);
  setEditableText(el, bootstrapMsg);

  // Poll until button becomes enabled, then click.
  // 10 attempts × 200ms = 2 s window (enough for Angular/React to re-render).
  let attempts = 0;
  const trySend = () => {
    attempts++;
    const currentBtn = options.getSendButton?.();
    if (currentBtn && checkEnabled(currentBtn)) {
      currentBtn.click();
      markBootstrappedThisSession(options.sessionKey);
      markInjectedThisSession(options.sessionKey);
      // Restore input visibility and clear content after send
      setTimeout(() => { showInput(); setEditableText(el, ''); }, 400);
    } else if (attempts < 10) {
      setTimeout(trySend, 200);
    } else {
      showInput(); // Restore even if send failed
    }
    // If 10 attempts exhausted: text insertion failed to register.
    // The inline injection path (ensureInstructionsInjected) handles the next message.
  };
  setTimeout(trySend, 300);

  return true;
}

// ─── wire ─────────────────────────────────────────────────────────────────────

const wiredInputs  = new WeakSet<HTMLElement>();
const wiredButtons = new WeakSet<HTMLElement>();

export function wireNuclearInjection(options: NuclearInjectionOptions) {
  const tryInject = () => ensureInstructionsInjected(options);

  // MutationObserver: re-attach keydown/click listeners as elements are added to DOM.
  // This is correct and does NOT affect bootstrap timing.
  const attach = () => {
    const input = options.getInputElement();
    if (input && !wiredInputs.has(input)) {
      wiredInputs.add(input);
      input.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter' && !(e as KeyboardEvent).shiftKey) tryInject();
      }, { capture: true });
    }
    const button = options.getSendButton?.();
    if (button && !wiredButtons.has(button)) {
      wiredButtons.add(button);
      button.addEventListener('click', tryInject, { capture: true });
    }
  };

  attach();
  const attachObs = new MutationObserver(attach);
  attachObs.observe(document.body, { childList: true, subtree: true });

  // Bootstrap: simple timeout loop — proven to work for both providers.
  // 4 s initial delay gives React (ChatGPT) and Angular (Gemini) time to fully mount.
  // 1.5 s retry handles slow machines and late-loading SPAs.
  // We do NOT use a MutationObserver here — it fires on every DOM change and
  // causes parallel bootstrap chains (race condition that broke ChatGPT in v26).
  const tryBootstrap = () => {
    if (hasBootstrappedThisSession(options.sessionKey)) return;
    if (!attemptSilentBootstrap(options)) setTimeout(tryBootstrap, 1500);
  };
  setTimeout(tryBootstrap, 4000);

  return () => attachObs.disconnect();
}
