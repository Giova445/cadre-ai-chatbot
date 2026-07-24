// Pure embed-snippet generator (Admin § A4) — the inverse of
// widget/src/config.ts's `parseConfig`: given a resolved `EmbedSelection`,
// emit the `data-*` attributes (script-loader form) or query-string params
// (iframe-fallback form) that `parseConfig` would read back to exactly that
// config. No DOM, no network — unit-testable like lib/starters.ts.
//
// SECURITY NOTE: the emitted snippet carries ONLY the public `client` id and
// the deploy's public `apiBase` origin. No API key, no secret, no admin
// session ever flows through this module — the LLM/embeddings keys live only
// in process.env, read inside app/api/chat/route.ts. Pasting the snippet
// exposes nothing a visitor to the client's site couldn't already see over
// the wire.

import {
  DEFAULT_COLOR,
  DEFAULT_GREETING,
  DEFAULT_LAUNCHER_LABEL,
  DEFAULT_POSITION,
  DEFAULT_THEME,
  type WidgetMode,
  type WidgetPosition,
  type WidgetTheme,
} from "@/widget/src/config";
import { sanitizeClientId } from "@/lib/clients";

export type EmbedSelection = {
  client: string; // from the registry dropdown — never free text
  apiBase: string; // our deploy origin, e.g. "https://chat.gocadre.ai"
  mode: WidgetMode;
  target?: string | null; // inline only; a CSS selector
  color: string;
  position: WidgetPosition; // launcher only
  theme: WidgetTheme;
  greeting: string;
  launcherLabel: string; // launcher only
  contactUrl: string; // absolute; default `${apiBase}/contact`
};

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** HTML-attribute-escape a value (defense-in-depth; values may be operator text). */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dataAttr(name: string, value: string): string {
  return `data-${name}="${escapeAttr(value)}"`;
}

function defaultContactUrl(apiBase: string): string {
  return `${stripTrailingSlash(apiBase)}/contact`;
}

/**
 * Build the recommended `<script data-*>` loader snippet. Emits only
 * non-default `data-*` attributes (see the field table in
 * docs/product/admin-embed-and-sitemap.md § A4) so a client on brand defaults
 * gets a bare `<script src=… data-client="acme" async></script>`. `client` is
 * re-`sanitizeClientId`'d before emission even though it came from a trusted
 * dropdown (defense-in-depth).
 */
export function buildScriptSnippet(s: EmbedSelection): string {
  const client = sanitizeClientId(s.client) || s.client;
  const apiBase = stripTrailingSlash(s.apiBase);
  const src = `${apiBase}/widget.js`;

  const attrs: string[] = [dataAttr("client", client)];

  if (s.mode === "inline") {
    attrs.push(dataAttr("mode", "inline"));
    if (s.target) attrs.push(dataAttr("target", s.target));
  }
  // data-api-base intentionally omitted: the script src IS apiBase, so the
  // widget's own currentScript.src derivation already resolves to it.
  if (s.color !== DEFAULT_COLOR) attrs.push(dataAttr("color", s.color));
  if (s.mode !== "inline" && s.position !== DEFAULT_POSITION) {
    attrs.push(dataAttr("position", s.position));
  }
  if (s.theme !== DEFAULT_THEME) attrs.push(dataAttr("theme", s.theme));
  if (s.greeting !== DEFAULT_GREETING) attrs.push(dataAttr("greeting", s.greeting));
  if (s.mode !== "inline" && s.launcherLabel !== DEFAULT_LAUNCHER_LABEL) {
    attrs.push(dataAttr("launcher-label", s.launcherLabel));
  }
  if (s.contactUrl && s.contactUrl !== defaultContactUrl(apiBase)) {
    attrs.push(dataAttr("contact-url", s.contactUrl));
  }

  return [
    "<script",
    `  src="${escapeAttr(src)}"`,
    ...attrs.map((a) => `  ${a}`),
    "  async",
    "></script>",
  ].join("\n");
}

/**
 * Build the `<iframe>` fallback for strict-isolation hosts that can't run the
 * script loader. Encodes the same `EmbedSelection` as URL query params on the
 * chromeless `/embed/preview` route (the same route that powers the admin
 * panel's live preview — see app/embed/preview/page.tsx) so the two snippet
 * forms are always consistent with each other and with the preview.
 */
export function buildIframeSnippet(s: EmbedSelection): string {
  const client = sanitizeClientId(s.client) || s.client;
  const apiBase = stripTrailingSlash(s.apiBase);

  const params = new URLSearchParams();
  params.set("client", client);
  if (s.mode === "inline") {
    params.set("mode", "inline");
    if (s.target) params.set("target", s.target);
  }
  if (s.color !== DEFAULT_COLOR) params.set("color", s.color);
  if (s.mode !== "inline" && s.position !== DEFAULT_POSITION) {
    params.set("position", s.position);
  }
  if (s.theme !== DEFAULT_THEME) params.set("theme", s.theme);
  if (s.greeting !== DEFAULT_GREETING) params.set("greeting", s.greeting);

  const src = `${apiBase}/embed/preview?${params.toString()}`;

  return [
    "<iframe",
    `  src="${escapeAttr(src)}"`,
    '  title="Cadre AI chat"',
    '  style="border:0;width:100%;height:600px"',
    '  loading="lazy"',
    "></iframe>",
  ].join("\n");
}
