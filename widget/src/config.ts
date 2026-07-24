// Widget configuration: parses `data-*` attributes on the loader `<script>` tag
// and an optional `window.CadreChat` object into a single frozen WidgetConfig.
// Precedence: window.CadreChat > data-* > built-in defaults (per
// docs/product/client-rollout-features.md § A "Config and theming").
//
// `parseConfig` is PURE (no DOM globals touched) so it is unit-testable in a
// Node/vitest environment; `readConfig` is the thin browser adapter that feeds
// it `document.currentScript`'s dataset/src + `window.CadreChat`.

import { sanitizeStarters } from "@/lib/starters";

export type WidgetPosition = "bottom-right" | "bottom-left";
export type WidgetTheme = "auto" | "light" | "dark";
// "launcher" (default) = today's floating-bubble behavior, unchanged.
// "inline" = mount the visible panel into `target` (a CSS selector), in page
// flow — no bubble, no fixed positioning. See docs/product/admin-embed-and-sitemap.md § A3.
export type WidgetMode = "launcher" | "inline";

export type WidgetConfig = {
  readonly client: string;
  readonly apiBase: string;
  readonly color: string;
  readonly position: WidgetPosition;
  readonly greeting: string;
  readonly launcherLabel: string;
  readonly theme: WidgetTheme;
  readonly contactUrl: string;
  // The maker's starter-chip override (the "snippet" tier). null = unset (the
  // panel falls through to lib/starters' DEFAULT_STARTERS); [] = explicit
  // "no chips", honored as-is. Typed as a mutable array (not `readonly`) so it
  // can be passed straight into lib/starters' `resolveStarters({ snippet })`.
  readonly starters: string[] | null;
  // NEW — render mode. Default "launcher" (current behavior).
  readonly mode: WidgetMode;
  // NEW — inline mount selector (CSS selector string); null in launcher mode
  // or when the operator didn't supply one (index.ts then falls back to the
  // loader <script>'s parent element).
  readonly target: string | null;
};

// `window.CadreChat` — set by the host page BEFORE the loader <script> tag.
export type CadreChatOverrides = Partial<{
  client: string;
  apiBase: string;
  color: string;
  position: string;
  greeting: string;
  launcherLabel: string;
  theme: string;
  contactUrl: string;
  starters: unknown; // string[] | JSON string | "|"-delimited string
  mode: string;
  target: string;
}>;

// The loader <script>'s `data-*` attributes (i.e. HTMLScriptElement.dataset).
export type WidgetDataset = Partial<{
  client: string;
  apiBase: string;
  color: string;
  position: string;
  greeting: string;
  launcherLabel: string;
  theme: string;
  contactUrl: string;
  starters: string;
  mode: string;
  target: string;
}>;

// Exported so consumers that must stay correct-by-construction against these
// defaults (the admin embed-snippet generator — lib/widget-snippet.ts) import
// them rather than duplicating the values.
export const DEFAULT_COLOR = "#db4545"; // brand coral-red (app/globals.css --red)
export const DEFAULT_POSITION: WidgetPosition = "bottom-right";
export const DEFAULT_GREETING = "Hi! Ask me anything about Cadre AI.";
export const DEFAULT_LAUNCHER_LABEL = "Chat with us";
export const DEFAULT_THEME: WidgetTheme = "auto";
export const DEFAULT_MODE: WidgetMode = "launcher";

function isPosition(value: string | undefined): value is WidgetPosition {
  return value === "bottom-right" || value === "bottom-left";
}

function isTheme(value: string | undefined): value is WidgetTheme {
  return value === "auto" || value === "light" || value === "dark";
}

function isMode(value: string | undefined): value is WidgetMode {
  return value === "launcher" || value === "inline";
}

/**
 * Parse a starters override (from `window.CadreChat.starters` OR the raw
 * `data-starters` string) into an array, or `null` when unset. An array is
 * sanitized as-is (so an explicit `[]` is honored as "no chips"); a string is
 * tried as JSON first, then falls back to a `|`-delimited list; an empty
 * string is treated as an explicit "no chips".
 */
export function parseStarters(raw: unknown): string[] | null {
  if (raw === undefined || raw === null) return null;
  if (Array.isArray(raw)) return sanitizeStarters(raw);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return sanitizeStarters(parsed);
  } catch {
    // Not JSON — fall through to the `|`-delimited form.
  }
  return sanitizeStarters(trimmed.split("|"));
}

function deriveApiBase(scriptSrc: string | null): string {
  if (!scriptSrc) return "";
  try {
    return new URL(scriptSrc).origin;
  } catch {
    return "";
  }
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Pure config resolver. `dataset` mirrors the loader script's `data-*`
 * attributes; `overrides` mirrors `window.CadreChat` (undefined if the host
 * page never set it); `scriptSrc` is the loader script's `src` (used only to
 * auto-derive `apiBase` — never re-read `document.currentScript` here, since
 * it is only valid during the script's own synchronous top-level execution).
 */
export function parseConfig(
  dataset: WidgetDataset,
  overrides: CadreChatOverrides | undefined,
  scriptSrc: string | null,
): WidgetConfig {
  const o = overrides ?? {};

  const client = o.client ?? dataset.client ?? "";

  const apiBaseRaw = o.apiBase ?? dataset.apiBase ?? deriveApiBase(scriptSrc);
  const apiBase = stripTrailingSlash(apiBaseRaw);

  const color = o.color ?? dataset.color ?? DEFAULT_COLOR;

  const positionRaw = o.position ?? dataset.position;
  const position = isPosition(positionRaw) ? positionRaw : DEFAULT_POSITION;

  const greeting = o.greeting ?? dataset.greeting ?? DEFAULT_GREETING;
  const launcherLabel =
    o.launcherLabel ?? dataset.launcherLabel ?? DEFAULT_LAUNCHER_LABEL;

  const themeRaw = o.theme ?? dataset.theme;
  const theme = isTheme(themeRaw) ? themeRaw : DEFAULT_THEME;

  // ABSOLUTE, always — the inline app's escalation CTA is a relative
  // "/contact" that resolves to the HOST page's origin when embedded; the
  // widget must point back at OUR origin.
  const contactUrl = o.contactUrl ?? dataset.contactUrl ?? `${apiBase}/contact`;

  const starters =
    o.starters !== undefined ? parseStarters(o.starters) : parseStarters(dataset.starters);

  const modeRaw = o.mode ?? dataset.mode;
  const mode = isMode(modeRaw) ? modeRaw : DEFAULT_MODE;

  const targetRaw = o.target ?? dataset.target;
  const target = typeof targetRaw === "string" && targetRaw.trim().length > 0 ? targetRaw.trim() : null;

  return Object.freeze({
    client,
    apiBase,
    color,
    position,
    greeting,
    launcherLabel,
    theme,
    contactUrl,
    starters,
    mode,
    target,
  });
}

/** Browser entry point. `scriptEl` must be captured synchronously at the
 * widget bundle's top-level execution (see widget/src/index.ts) — by the time
 * any later callback (e.g. DOMContentLoaded) runs, `document.currentScript`
 * has already reset to null for an `async`-loaded script. */
export function readConfig(scriptEl: HTMLScriptElement | null): WidgetConfig {
  const dataset = (scriptEl?.dataset ?? {}) as WidgetDataset;
  const overrides = (window as unknown as { CadreChat?: CadreChatOverrides }).CadreChat;
  const scriptSrc = scriptEl?.src ?? null;
  return parseConfig(dataset, overrides, scriptSrc);
}
