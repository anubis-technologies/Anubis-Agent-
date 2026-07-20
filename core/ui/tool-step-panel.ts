/**
 * Anubis Agent — Tool step panel v4.
 *
 * v4 changes vs v3:
 * - addStep() now accepts an optional commandDetail string.
 * - commandDetail is rendered below the tool name in monospace (like DeepSeek's tool block).
 * - CSS for .anubis-step-cmd added.
 */

import { injectInjectedThemeStyles } from './injected-theme';

export interface ToolStepPanelHandle {
  addStep: (id: string, label: string, commandDetail?: string) => void;
  resolveStep: (id: string, ok: boolean, detail?: string) => void;
  destroy: () => void;
}

const STYLE_ID = 'anubis-inline-panel-style';

function ensureStyles() {
  injectInjectedThemeStyles();
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* ── Anubis inline process panel — mirrors DeepSeek thinking block ── */
    .anubis-process-panel {
      margin: 10px 0 6px 0;
      border: 1px solid var(--dpp-ui-border, rgba(212,175,55,0.22));
      border-radius: 10px;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      background: var(--dpp-ui-surface, rgba(20,20,20,0.6));
      animation: anubis-panel-in 0.18s ease;
    }
    @keyframes anubis-panel-in {
      from { opacity: 0; transform: translateY(-3px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .anubis-panel-header {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      cursor: pointer;
      user-select: none;
      color: var(--dpp-ui-text-muted, rgba(255,255,255,0.5));
      background: var(--dpp-ui-surface-muted, rgba(255,255,255,0.03));
      transition: background 0.12s;
    }
    .anubis-panel-header:hover {
      background: var(--dpp-ui-surface-hover, rgba(255,255,255,0.06));
      color: var(--dpp-ui-text, rgba(255,255,255,0.9));
    }

    .anubis-panel-icon {
      width: 15px;
      height: 15px;
      color: var(--dpp-ui-accent, #d4af37);
      flex-shrink: 0;
    }
    .anubis-panel-title {
      font-size: 12.5px;
      font-weight: 500;
      flex: 1;
      color: inherit;
    }
    /* Spinner shown while tasks are pending */
    .anubis-panel-spinner {
      width: 11px;
      height: 11px;
      border: 1.5px solid var(--dpp-ui-border, rgba(255,255,255,0.15));
      border-top-color: var(--dpp-ui-accent, #d4af37);
      border-radius: 50%;
      animation: anubis-spin 0.75s linear infinite;
      flex-shrink: 0;
    }
    @keyframes anubis-spin { to { transform: rotate(360deg); } }
    .anubis-panel-spinner.hidden { display: none; }

    .anubis-panel-chevron {
      width: 11px;
      height: 11px;
      color: inherit;
      transition: transform 0.2s ease;
      flex-shrink: 0;
    }
    .anubis-process-panel[data-collapsed="true"] .anubis-panel-chevron {
      transform: rotate(-90deg);
    }

    /* Body — step list */
    .anubis-panel-body {
      overflow: hidden;
      max-height: 600px;
      opacity: 1;
      transition: max-height 0.28s ease, opacity 0.2s ease;
      padding: 4px 12px 10px 22px;
    }
    .anubis-process-panel[data-collapsed="true"] .anubis-panel-body {
      max-height: 0;
      opacity: 0;
      padding-top: 0;
      padding-bottom: 0;
    }

    /* Individual step */
    .anubis-step {
      display: flex;
      align-items: flex-start;
      gap: 7px;
      padding: 3px 0;
      font-size: 12.5px;
      color: var(--dpp-ui-text, rgba(255,255,255,0.85));
      line-height: 1.5;
    }
    .anubis-step-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--dpp-ui-accent, #d4af37);
      flex-shrink: 0;
      margin-top: 7px;
    }
    .anubis-step-dot.pending {
      animation: anubis-dot-pulse 1s ease-in-out infinite;
    }
    @keyframes anubis-dot-pulse {
      0%,100% { opacity: 1; }
      50%      { opacity: 0.2; }
    }
    .anubis-step-dot.error {
      background: var(--dpp-ui-error, #e05252);
    }
    .anubis-step-name {
      font-family: 'SF Mono', Monaco, Menlo, Consolas, monospace;
      font-size: 11.5px;
      color: var(--dpp-ui-accent, #d4af37);
    }
    .anubis-step-status {
      font-size: 11.5px;
      color: var(--dpp-ui-text-muted, rgba(255,255,255,0.45));
      margin-left: 5px;
    }
    .anubis-step-status.done  { color: var(--dpp-ui-success, #1ac36a); }
    .anubis-step-status.error { color: var(--dpp-ui-error, #e05252); }

    /* Command detail line — shown below tool name, like DeepSeek */
    .anubis-step-cmd {
      font-family: 'SF Mono', Monaco, Menlo, Consolas, monospace;
      font-size: 10.5px;
      color: var(--dpp-ui-text-muted, rgba(255,255,255,0.4));
      margin-top: 2px;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 72px;
      overflow: hidden;
      line-height: 1.4;
    }
  `;
  document.head.appendChild(style);
}

// ── Inline injection helpers ──────────────────────────────────────────────────
// We inject the panel directly after the last assistant message element.
// If we can't find a good anchor, we fall back to appending to body (hidden).

function findBestAnchor(): HTMLElement | null {
  // ChatGPT
  const cgptEls = Array.from(document.querySelectorAll<HTMLElement>('[data-message-author-role="assistant"]'));
  if (cgptEls.length) return cgptEls[cgptEls.length - 1];

  // Gemini
  const geminiEls = Array.from(document.querySelectorAll<HTMLElement>(
    'model-response, message-content, .model-response-text, ms-chat-turn[role="model"]',
  ));
  if (geminiEls.length) return geminiEls[geminiEls.length - 1];

  return null;
}

function injectPanel(panel: HTMLElement) {
  const anchor = findBestAnchor();
  if (anchor) {
    // Insert immediately after the anchor element
    anchor.insertAdjacentElement('afterend', panel);
  } else {
    // Fallback: append to body (won't be visible in chat, but won't crash)
    document.body.appendChild(panel);
  }
}

// ── Panel factory ─────────────────────────────────────────────────────────────

export function createToolStepPanel(_title: string): ToolStepPanelHandle {
  ensureStyles();

  let panel: HTMLElement | null = null;
  let titleEl: HTMLElement | null = null;
  let spinnerEl: HTMLElement | null = null;
  let bodyEl: HTMLElement | null = null;

  let total   = 0;
  let pending = 0;
  let collapseTimer: ReturnType<typeof setTimeout> | null = null;

  function buildPanel() {
    panel = document.createElement('div');
    panel.className = 'anubis-process-panel';
    panel.setAttribute('data-collapsed', 'false');

    panel.innerHTML = `
      <div class="anubis-panel-header">
        <svg class="anubis-panel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
        </svg>
        <span class="anubis-panel-title">Executing…</span>
        <div class="anubis-panel-spinner"></div>
        <svg class="anubis-panel-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      <div class="anubis-panel-body"></div>
    `;

    titleEl   = panel.querySelector('.anubis-panel-title');
    spinnerEl = panel.querySelector('.anubis-panel-spinner');
    bodyEl    = panel.querySelector('.anubis-panel-body');

    panel.querySelector('.anubis-panel-header')!.addEventListener('click', () => {
      const collapsed = panel!.getAttribute('data-collapsed') === 'true';
      panel!.setAttribute('data-collapsed', collapsed ? 'false' : 'true');
    });

    injectPanel(panel);
  }

  function updateTitle() {
    if (!titleEl) return;
    if (pending > 0) {
      titleEl.textContent = `Executing tools (${total})`;
    } else {
      titleEl.textContent = total === 1 ? `Executed 1 tool` : `Executed ${total} tools`;
    }
  }

  function scheduleCollapse() {
    if (collapseTimer) clearTimeout(collapseTimer);
    collapseTimer = setTimeout(() => {
      panel?.setAttribute('data-collapsed', 'true');
    }, 4000);
  }

  return {
    addStep(id, label, commandDetail?) {
      // Build panel on first step (after the current message has rendered)
      if (!panel) buildPanel();

      total++;
      pending++;

      // Strip MCP server prefix from name
      const shortLabel = label.replace(/^[a-z0-9_-]+__/i, '');

      // Safely escape command detail for inline HTML
      const cmdHtml = commandDetail
        ? `<div class="anubis-step-cmd">${commandDetail.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`
        : '';

      const step = document.createElement('div');
      step.className = 'anubis-step';
      step.dataset.stepId = id;
      step.innerHTML = `
        <div class="anubis-step-dot pending"></div>
        <div style="flex:1;min-width:0;">
          <span class="anubis-step-name">${shortLabel}</span>
          <span class="anubis-step-status">running…</span>
          ${cmdHtml}
        </div>
      `;
      bodyEl?.appendChild(step);
      updateTitle();

      // Make sure the panel is expanded while running
      panel!.setAttribute('data-collapsed', 'false');
      if (collapseTimer) { clearTimeout(collapseTimer); collapseTimer = null; }
    },

    resolveStep(id, ok, detail) {
      const step = bodyEl?.querySelector<HTMLElement>(`[data-step-id="${id}"]`);
      if (!step) return;

      const dot    = step.querySelector('.anubis-step-dot');
      const status = step.querySelector<HTMLElement>('.anubis-step-status');

      dot?.classList.remove('pending');
      if (!ok) dot?.classList.add('error');

      if (status) {
        status.textContent = ok ? 'done' : 'failed';
        status.className   = `anubis-step-status ${ok ? 'done' : 'error'}`;
      }

      pending = Math.max(0, pending - 1);
      updateTitle();

      if (spinnerEl && pending === 0) spinnerEl.classList.add('hidden');
      if (pending === 0) scheduleCollapse();
    },

    destroy() {
      if (collapseTimer) clearTimeout(collapseTimer);
      panel?.remove();
      panel = null;
    },
  };
}
