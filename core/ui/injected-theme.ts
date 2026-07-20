const STYLE_ID = 'dpp-injected-theme-css';

export function injectInjectedThemeStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  // Black & Gold palette — accent hue 85 (gold) replaces the original blue (264).
  // All other variables keep the same structure so existing tool-block CSS works unchanged.
  style.textContent = `
body {
  --dpp-ui-surface:       oklch(0.998 0.002 85);
  --dpp-ui-surface-muted: oklch(0.965 0.005 85);
  --dpp-ui-surface-hover: oklch(0.95  0.006 85);
  --dpp-ui-text:          oklch(0.24  0.018 85);
  --dpp-ui-text-muted:    oklch(0.52  0.020 85);
  --dpp-ui-text-subtle:   oklch(0.70  0.015 85);
  --dpp-ui-border:        oklch(0.90  0.008 85);
  --dpp-ui-border-muted:  oklch(0.94  0.006 85);
  --dpp-ui-accent:        oklch(0.70  0.16  85);   /* gold */
  --dpp-ui-accent-strong: oklch(0.62  0.17  83);
  --dpp-ui-accent-soft:   oklch(0.96  0.03  85);
  --dpp-ui-accent-panel:  oklch(0.70  0.16  85 / 0.07);
  --dpp-ui-code-bg:       oklch(0.30  0.02  85 / 0.06);
  --dpp-ui-danger:        oklch(0.64  0.22  25);
  --dpp-ui-danger-panel:  oklch(0.64  0.22  25 / 0.08);
  --dpp-ui-success:       oklch(0.70  0.15 162);
  --dpp-ui-warning:       oklch(0.75  0.15  75);
  --dpp-ui-error:         oklch(0.64  0.22  25);
  --dpp-ui-shadow:        0 0 0 1px var(--dpp-ui-border), inset 0 1px 0 oklch(1 0 0 / 0.05);
  --dpp-ui-panel-shadow:  -14px 0 40px oklch(0.25 0.04 85 / 0.14);
}

body.dpp-theme-dark {
  --dpp-ui-surface:       oklch(0.12  0.006 85);
  --dpp-ui-surface-muted: oklch(0.15  0.008 85);
  --dpp-ui-surface-hover: oklch(0.19  0.010 85);
  --dpp-ui-text:          oklch(0.93  0.012 85);
  --dpp-ui-text-muted:    oklch(0.76  0.015 85);
  --dpp-ui-text-subtle:   oklch(0.60  0.015 85);
  --dpp-ui-border:        oklch(0.28  0.014 85);
  --dpp-ui-border-muted:  oklch(0.22  0.010 85);
  --dpp-ui-accent:        oklch(0.74  0.14  85);
  --dpp-ui-accent-strong: oklch(0.82  0.12  85);
  --dpp-ui-accent-soft:   oklch(0.30  0.06  85 / 0.55);
  --dpp-ui-accent-panel:  oklch(0.74  0.14  85 / 0.12);
  --dpp-ui-code-bg:       oklch(1 0 0 / 0.08);
  --dpp-ui-danger:        oklch(0.72  0.18  25);
  --dpp-ui-danger-panel:  oklch(0.30  0.06  25 / 0.22);
  --dpp-ui-success:       oklch(0.78  0.14 162);
  --dpp-ui-warning:       oklch(0.80  0.14  75);
  --dpp-ui-error:         oklch(0.72  0.18  25);
  --dpp-ui-shadow:        0 0 0 1px var(--dpp-ui-border), inset 0 1px 0 oklch(1 0 0 / 0.04);
  --dpp-ui-panel-shadow:  -14px 0 40px oklch(0.02 0.01 85 / 0.5);
}

@media (prefers-color-scheme: dark) {
  body:not(.dpp-theme-light) {
    --dpp-ui-surface:       oklch(0.12  0.006 85);
    --dpp-ui-surface-muted: oklch(0.15  0.008 85);
    --dpp-ui-surface-hover: oklch(0.19  0.010 85);
    --dpp-ui-text:          oklch(0.93  0.012 85);
    --dpp-ui-text-muted:    oklch(0.76  0.015 85);
    --dpp-ui-text-subtle:   oklch(0.60  0.015 85);
    --dpp-ui-border:        oklch(0.28  0.014 85);
    --dpp-ui-border-muted:  oklch(0.22  0.010 85);
    --dpp-ui-accent:        oklch(0.74  0.14  85);
    --dpp-ui-accent-strong: oklch(0.82  0.12  85);
    --dpp-ui-accent-soft:   oklch(0.30  0.06  85 / 0.55);
    --dpp-ui-accent-panel:  oklch(0.74  0.14  85 / 0.12);
    --dpp-ui-code-bg:       oklch(1 0 0 / 0.08);
    --dpp-ui-danger:        oklch(0.72  0.18  25);
    --dpp-ui-danger-panel:  oklch(0.30  0.06  25 / 0.22);
    --dpp-ui-success:       oklch(0.78  0.14 162);
    --dpp-ui-warning:       oklch(0.80  0.14  75);
    --dpp-ui-error:         oklch(0.72  0.18  25);
    --dpp-ui-shadow:        0 0 0 1px var(--dpp-ui-border), inset 0 1px 0 oklch(1 0 0 / 0.04);
    --dpp-ui-panel-shadow:  -14px 0 40px oklch(0.02 0.01 85 / 0.5);
  }
}
`;
  document.head.appendChild(style);
}
