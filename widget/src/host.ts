// Mounts the widget's isolation boundary: one host `<div>` appended to
// `document.body`, an OPEN shadow root, and an adopted stylesheet (falling
// back to an inline `<style>` where CSSStyleSheet.replaceSync/adoptedStyleSheets
// isn't available). `mode: "open"` is deliberate — `closed` buys nothing
// against a hostile host page (it can monkeypatch `attachShadow` before the
// widget ever runs) and only costs debuggability; nothing sensitive lives in
// the DOM (the secret stays server-side). See
// docs/product/client-rollout-features.md § A "Isolation: Shadow DOM".

import { buildStyles } from "./styles";
import type { WidgetConfig } from "./config";

const HOST_ID = "cadre-chat-widget-host";
const ROOT_ID = "cadre-root";

export type WidgetHost = {
  /** Append the launcher + panel elements here. */
  root: HTMLElement;
  /** The host <div> itself — toggle classes (theme/position) on this. */
  element: HTMLDivElement;
};

function supportsAdoptedStyleSheets(): boolean {
  return (
    typeof CSSStyleSheet !== "undefined" &&
    "replaceSync" in CSSStyleSheet.prototype &&
    "adoptedStyleSheets" in Document.prototype
  );
}

function applyStyles(shadowRoot: ShadowRoot, css: string): void {
  if (supportsAdoptedStyleSheets()) {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      shadowRoot.adoptedStyleSheets = [sheet];
      return;
    } catch {
      // Fall through to the <style> fallback below.
    }
  }
  const style = document.createElement("style");
  style.textContent = css;
  shadowRoot.appendChild(style);
}

/** Idempotent: a second call (e.g. the snippet pasted twice) reuses the
 * existing host instead of double-mounting. */
export function mountHost(cfg: WidgetConfig): WidgetHost {
  const existing = document.getElementById(HOST_ID) as HTMLDivElement | null;
  if (existing?.shadowRoot) {
    const root = existing.shadowRoot.getElementById(ROOT_ID);
    if (root) return { root, element: existing };
  }

  const element = document.createElement("div");
  element.id = HOST_ID;
  element.className = `cadre-pos-${cfg.position} cadre-theme-${cfg.theme}`;
  element.style.setProperty("--cadre-accent", cfg.color);

  const shadowRoot = element.attachShadow({ mode: "open" });
  applyStyles(shadowRoot, buildStyles());

  const root = document.createElement("div");
  root.id = ROOT_ID;
  shadowRoot.appendChild(root);

  document.body.appendChild(element);

  return { root, element };
}
