// Boot: reads config, mounts the Shadow DOM host, wires the launcher <-> panel
// open/close state + unread badge, and appends both into the shadow root.

import { readConfig } from "./config";
import { mountHost } from "./host";
import { createLauncher } from "./launcher";
import { createPanel } from "./panel";

// IMPORTANT: `document.currentScript` is only valid while THIS script's own
// top-level code is executing synchronously — for an `async`-loaded loader
// (the documented snippet), it resets to `null` by the time any later
// callback (e.g. a DOMContentLoaded listener) runs. So it is captured here,
// at the module's top level (still synchronous, even after hoisted imports —
// nothing above awaits or yields to the event loop) — never re-read inside
// `boot()`.
const currentScript = document.currentScript as HTMLScriptElement | null;

function boot(): void {
  const cfg = readConfig(currentScript);
  const { root, element: hostEl } = mountHost(cfg, currentScript);

  // mode:"inline" — mount the panel, visible, into the target container; no
  // launcher, no toggle, no unread badge, no Esc-to-close (there's nothing to
  // close). Everything else (Shadow DOM, transport, session, starters) is the
  // same createPanel() the launcher path uses.
  if (cfg.mode === "inline") {
    const panel = createPanel(cfg);
    panel.element.hidden = false;
    root.append(panel.element);
    return;
  }

  let open = false;
  let unread = 0;

  const panel = createPanel(cfg, {
    onTurnComplete: () => {
      if (!open) {
        unread += 1;
        launcher.setUnread(unread);
      }
    },
  });
  panel.element.hidden = true;
  panel.element.addEventListener("cadre:close", () => setOpen(false));

  const launcher = createLauncher(cfg, () => setOpen(!open));

  function setOpen(next: boolean): void {
    open = next;
    panel.element.hidden = !open;
    launcher.setOpen(open);
    if (open) {
      unread = 0;
      launcher.setUnread(0);
      // Wait a frame so the panel is laid out (not `hidden`) before focusing.
      requestAnimationFrame(() => panel.focusComposer());
    }
  }

  root.append(panel.element, launcher.element);

  // Keyboard a11y: Esc closes the open panel.
  hostEl.addEventListener("keydown", (e) => {
    if (e instanceof KeyboardEvent && e.key === "Escape" && open) {
      setOpen(false);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
