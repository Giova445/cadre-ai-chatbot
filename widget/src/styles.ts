// Scoped CSS for the widget's Shadow DOM tree. Echoes the brand tokens from
// app/globals.css as literal values (a shadow tree cannot read the HOST
// page's CSS custom properties): sand surfaces, ink text, the single coral
// accent, pill radius for interactive controls, 14px for cards/bubbles, and
// tinted soft shadows. `:host { all: initial }` stops the host page's
// inherited font/color/line-height from leaking across the shadow boundary;
// a system font stack avoids a web-font request against the host's CSP.
//
// Positioning + accent color are driven by classes/inline custom properties
// that widget/src/host.ts sets on the host element:
//   - `.cadre-pos-bottom-left` on the host flips the corner.
//   - `.cadre-theme-dark` / `.cadre-theme-light` force a theme; the default
//     (no class) follows `prefers-color-scheme`, matching the app's "auto".
//   - `--cadre-accent` (inline style) carries the configured brand color.

export function buildStyles(): string {
  return `
:host {
  all: initial;
  position: fixed;
  z-index: 2147483000;
  bottom: 20px;
  right: 20px;
  --cadre-accent: #db4545;
  --sand: #faf9f6;
  --sand-2: #f2efe4;
  --surface: #ffffff;
  --ink: #0c0407;
  --text: #262321;
  --text-muted: #6a655e;
  --text-subtle: #767065;
  --line: #e9e4d8;
  --line-strong: #ddd6c6;
  --red-tint: #fbeceb;
  --shadow-sm: 0 1px 2px rgba(12,4,7,0.05), 0 4px 14px rgba(12,4,7,0.04);
  --shadow-md: 0 14px 44px rgba(12,4,7,0.16);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 15px;
  line-height: 1.5;
  color: var(--text);
}
:host(.cadre-pos-bottom-left) {
  right: auto;
  left: 20px;
}
/* mode:"inline" — no floating corner, no launcher; sizes to its container. */
:host(.cadre-inline) {
  position: static;
  bottom: auto;
  right: auto;
  left: auto;
  z-index: auto;
  display: block;
  width: 100%;
}
@media (prefers-color-scheme: dark) {
  :host(:not(.cadre-theme-light)) {
    --sand: #14110e;
    --sand-2: #1d1a15;
    --surface: #1a1712;
    --ink: #f3efe6;
    --text: #efeae0;
    --text-muted: #b3ac9f;
    --text-subtle: #837c70;
    --line: #2c2820;
    --line-strong: #3a352b;
    --red-tint: #2a1917;
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.4), 0 4px 14px rgba(0,0,0,0.3);
    --shadow-md: 0 14px 44px rgba(0,0,0,0.5);
  }
}
:host(.cadre-theme-dark) {
  --sand: #14110e;
  --sand-2: #1d1a15;
  --surface: #1a1712;
  --ink: #f3efe6;
  --text: #efeae0;
  --text-muted: #b3ac9f;
  --text-subtle: #837c70;
  --line: #2c2820;
  --line-strong: #3a352b;
  --red-tint: #2a1917;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.4), 0 4px 14px rgba(0,0,0,0.3);
  --shadow-md: 0 14px 44px rgba(0,0,0,0.5);
}

* { box-sizing: border-box; }

button {
  font-family: inherit;
  cursor: pointer;
}
button:focus-visible {
  outline: 2px solid var(--cadre-accent);
  outline-offset: 2px;
}

/* ---- launcher bubble ------------------------------------------------- */
.cadre-launcher {
  position: relative;
  width: 58px;
  height: 58px;
  border: none;
  border-radius: 999px;
  background: var(--cadre-accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-md);
  transition: transform 0.15s ease;
}
.cadre-launcher:hover { transform: scale(1.05); }
.cadre-launcher:active { transform: scale(0.96); }
.cadre-launcher-icon { width: 24px; height: 24px; display: flex; }
.cadre-launcher-icon svg { width: 100%; height: 100%; }
.cadre-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--ink);
  color: var(--sand);
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 0 2px var(--cadre-accent);
}

/* ---- panel ------------------------------------------------------------ */
.cadre-panel {
  position: absolute;
  bottom: 72px;
  right: 0;
  width: min(376px, calc(100vw - 40px));
  height: min(560px, calc(100vh - 120px));
  display: flex;
  flex-direction: column;
  background: var(--sand);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: var(--shadow-md);
  overflow: hidden;
  animation: cadre-rise 0.2s cubic-bezier(0.16,1,0.3,1) both;
}
:host(.cadre-pos-bottom-left) .cadre-panel { right: auto; left: 0; }
/* inline mode: panel lives in page flow, not floated above the launcher. */
:host(.cadre-inline) .cadre-panel {
  position: static;
  width: 100%;
  height: 480px;
  animation: none;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
  flex-shrink: 0;
}
.panel-brand { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.panel-brand-name {
  font-weight: 650;
  font-size: 14.5px;
  color: var(--ink);
}
.panel-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
}
.panel-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #2f9e63;
  box-shadow: 0 0 0 2px rgba(47,158,99,0.16);
}
.panel-close {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
}
.panel-close:hover { background: var(--sand-2); color: var(--ink); }
.panel-close svg { width: 16px; height: 16px; }

.transcript {
  flex: 1;
  overflow-y: auto;
  padding: 16px 14px 6px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty-state { padding: 12px 2px; }
.empty-title { margin: 0; color: var(--text); font-size: 14px; }

.msg-row { display: flex; max-width: 100%; animation: cadre-rise 0.2s cubic-bezier(0.16,1,0.3,1) both; }
.msg-row.user { justify-content: flex-end; }
.msg-row.assistant { justify-content: flex-start; }
.msg {
  max-width: 86%;
  padding: 10px 13px;
  border-radius: 14px;
  font-size: 13.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
}
.msg.assistant {
  background: var(--surface);
  border: 1px solid var(--line);
  border-top-left-radius: 4px;
  box-shadow: var(--shadow-sm);
  color: var(--text);
}
.msg.user {
  background: var(--ink);
  color: var(--sand);
  border-top-right-radius: 4px;
}
.msg-text { margin: 0; }

.typing { display: inline-flex; gap: 4px; padding: 2px 0; }
.typing span {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--text-subtle);
  animation: cadre-bounce 1.2s infinite ease-in-out;
}
.typing span:nth-child(2) { animation-delay: 0.15s; }
.typing span:nth-child(3) { animation-delay: 0.3s; }

.sources {
  margin-top: 8px;
  padding-top: 7px;
  border-top: 1px solid var(--line);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  font-size: 11px;
}
.sources-label { color: var(--text-subtle); }
.source-pill {
  background: var(--sand-2);
  border: 1px solid var(--line);
  color: var(--text-muted);
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10.5px;
}

.escalation {
  display: flex;
  gap: 10px;
  max-width: 92%;
  background: var(--sand-2);
  border: 1px solid var(--line-strong);
  border-left: 3px solid var(--cadre-accent);
  border-radius: 14px;
  padding: 13px 15px;
  box-shadow: var(--shadow-sm);
}
.escalation-icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  margin-top: 1px;
  border-radius: 999px;
  background: var(--red-tint);
  color: var(--cadre-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 12px;
}
.escalation-body { min-width: 0; }
.escalation-text { margin: 0 0 10px; font-size: 13px; line-height: 1.5; color: var(--text); }
.escalation-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }

.cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--ink);
  color: var(--sand);
  padding: 8px 14px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 500;
  text-decoration: none;
}
.cta-arrow { color: var(--cadre-accent); }
.cta-secondary { font-size: 12px; color: var(--text-muted); text-decoration: none; }
.cta-secondary:hover { color: var(--cadre-accent); }

.chips { padding: 4px 14px 10px; flex-shrink: 0; }
.chips-label { display: block; font-size: 11px; color: var(--text-subtle); margin-bottom: 8px; }
.chips-grid { display: grid; grid-template-columns: 1fr; gap: 7px; }
.chip {
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--text);
  padding: 9px 12px;
  border-radius: 12px;
  font-size: 12.5px;
  line-height: 1.4;
  box-shadow: var(--shadow-sm);
}
.chip:hover { border-color: var(--cadre-accent); }

.composer {
  flex-shrink: 0;
  padding: 8px 12px 10px;
  background: var(--sand);
  border-top: 1px solid var(--line);
}
.composer-field {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  padding: 4px 4px 4px 14px;
}
.composer-field:focus-within {
  border-color: var(--cadre-accent);
  box-shadow: 0 0 0 3px var(--red-tint);
}
.composer-field input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 13.5px;
  padding: 7px 0;
  outline: none;
  font-family: inherit;
}
.composer-field input::placeholder { color: var(--text-subtle); }
.send-btn {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 999px;
  background: var(--ink);
  color: var(--sand);
  display: flex;
  align-items: center;
  justify-content: center;
}
.send-btn svg { width: 14px; height: 14px; }
.send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.disclaimer { text-align: center; font-size: 10px; color: var(--text-subtle); padding: 7px 4px 0; }

@keyframes cadre-rise {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes cadre-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
  30% { transform: translateY(-3px); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}

/* mobile: full-screen panel */
@media (max-width: 480px) {
  .cadre-panel {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100dvh;
    border-radius: 0;
    padding-bottom: env(safe-area-inset-bottom);
  }
}
`;
}
