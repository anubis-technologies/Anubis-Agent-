/**
 * Anubis Agent — Robust auto-send for ChatGPT and Gemini.
 *
 * The core problem: different machines, browsers, OS security settings, and
 * React/Angular versions all handle programmatic input + click differently.
 * We try 5 strategies in sequence, with delays tuned to let the framework
 * catch up between each attempt.
 *
 * Strategy order (most reliable → most aggressive):
 *   1. Dispatch InputEvent + click send button
 *   2. execCommand('insertText') + click
 *   3. Set textContent directly + manual React synthetic event + click
 *   4. Keyboard simulation (Enter key dispatch)
 *   5. Form submit event
 */

export interface AutoSendOptions {
  getInput:  () => HTMLElement | null;
  getButton: () => HTMLElement | null;
  text: string;
  /** How many ms to wait before attempting send after text is set. Default 180. */
  sendDelay?: number;
}

/** Set text into contenteditable or textarea/input using every known method. */
function setInputText(el: HTMLElement, text: string): boolean {
  try {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      // React-friendly: use native setter so onChange fires
      const proto   = Object.getPrototypeOf(el);
      const setter  = Object.getOwnPropertyDescriptor(proto, 'value')?.set
                   ?? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) {
        setter.call(el, text);
      } else {
        (el as any).value = text;
      }
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    // contenteditable — try execCommand first (works on most browsers)
    el.focus();
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    const inserted = document.execCommand('insertText', false, text);
    if (inserted && (el.textContent ?? '').trim() === text.trim()) return true;

    // execCommand failed — set directly and fire synthetic events
    el.textContent = text;
    // Move cursor to end
    const sel2 = window.getSelection();
    if (sel2 && el.lastChild) {
      const range2 = document.createRange();
      range2.setStartAfter(el.lastChild);
      range2.collapse(true);
      sel2.removeAllRanges();
      sel2.addRange(range2);
    }
    el.dispatchEvent(new InputEvent('input',  { bubbles: true, data: text, inputType: 'insertText' }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  } catch { return false; }
}

/** Try clicking a button using every method. */
function clickButton(btn: HTMLElement): boolean {
  try {
    btn.click();
    return true;
  } catch { /* ignore */ }
  try {
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return true;
  } catch { return false; }
}

/** Simulate pressing Enter in an input. Used as last resort. */
function simulateEnter(el: HTMLElement) {
  const opts = { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 };
  el.dispatchEvent(new KeyboardEvent('keydown',  { ...opts }));
  el.dispatchEvent(new KeyboardEvent('keypress', { ...opts }));
  el.dispatchEvent(new KeyboardEvent('keyup',    { ...opts }));
}

/** Submit any ancestor form. Used as absolute last resort. */
function submitForm(el: HTMLElement): boolean {
  try {
    const form = el.closest('form');
    if (!form) return false;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    return true;
  } catch { return false; }
}

/**
 * Robust text-insert-and-send.
 *
 * Tries up to 5 strategies. Each one waits a bit longer to give slow
 * machines time to register events before declaring success.
 *
 * On slow/friend-PCs the earlier strategies may fail silently — the later
 * ones are more aggressive and will fire anyway.
 */
export async function robustInsertAndSend(opts: AutoSendOptions): Promise<void> {
  const delay    = opts.sendDelay ?? 180;
  const { text } = opts;

  const input  = opts.getInput();
  const button = opts.getButton();
  if (!input) return;

  const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

  // ── Strategy 1: Standard input + button click ──────────────────────────────
  setInputText(input, text);
  await wait(delay);
  if (button && clickButton(button)) {
    // Give it 300ms to verify the input was sent (button becomes disabled while loading)
    await wait(300);
    const btn2 = opts.getButton();
    if (!btn2 || btn2 !== button || btn2.getAttribute('disabled') !== null) return; // sent!
    // Button re-enabled immediately — probably didn't work; try next strategy
  }

  // ── Strategy 2: Re-focus + execCommand + click ─────────────────────────────
  input.blur();
  await wait(50);
  input.focus();
  await wait(50);

  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
    const s = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
    s?.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    input.focus();
    document.execCommand('selectAll', false);
    document.execCommand('insertText', false, text);
    if ((input.textContent ?? '').trim() !== text.trim()) {
      input.innerHTML = '';
      const p = document.createElement('p');
      p.textContent = text;
      input.appendChild(p);
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
    }
  }

  await wait(delay + 80);
  const btn2 = opts.getButton();
  if (btn2 && clickButton(btn2)) {
    await wait(300);
    const btn3 = opts.getButton();
    if (!btn3 || btn3 !== btn2 || btn3.hasAttribute('disabled')) return; // sent!
  }

  // ── Strategy 3: Simulated keyboard Enter ───────────────────────────────────
  await wait(100);
  simulateEnter(input);
  await wait(300);
  const btn4 = opts.getButton();
  if (!btn4 || btn4.hasAttribute('disabled')) return; // Enter worked

  // ── Strategy 4: React internal fiber hack (for contenteditable) ───────────
  await wait(100);
  try {
    const fiberKey = Object.keys(input).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    if (fiberKey) {
      const fiber = (input as any)[fiberKey];
      const onChange = fiber?.memoizedProps?.onChange ?? fiber?.return?.memoizedProps?.onChange;
      if (typeof onChange === 'function') {
        onChange({ target: input, currentTarget: input, bubbles: true });
      }
    }
  } catch { /* ignore */ }
  await wait(delay);
  const btn5 = opts.getButton();
  if (btn5 && clickButton(btn5)) {
    await wait(200);
    return;
  }

  // ── Strategy 5: Form submit ────────────────────────────────────────────────
  await wait(100);
  submitForm(input);
}
