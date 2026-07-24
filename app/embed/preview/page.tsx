import type { Metadata } from "next";
import { headers } from "next/headers";
import { sanitizeClientId, DEFAULT_CLIENT_ID } from "@/lib/clients";
import type { WidgetMode, WidgetPosition, WidgetTheme } from "@/widget/src/config";

// Chromeless preview host (Admin § A5) — boots the REAL public/widget.js with
// the selection read from the query string, so the admin embed panel's
// preview iframe renders the exact production bundle, not a re-implemented
// mock. NOT admin-gated: it shows only public widget UI (the same chips/copy
// any visitor to a client's site would see) and reads only the already-public,
// already-CORS'd /api/widget-config — no secret, no admin action, no
// mutation. Deliberately outside `app/admin/(protected)/` (per the task) so it
// stays reachable from a sandboxed same-origin iframe embedded in the admin
// page without inheriting admin chrome/auth semantics.
export const metadata: Metadata = {
  title: "Cadre AI — widget preview",
  robots: { index: false, follow: false },
};

const PREVIEW_TARGET_ID = "cadre-preview-target";

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(sp: SearchParams, key: string): string | undefined {
  const value = sp[key];
  return typeof value === "string" ? value : undefined;
}

function isMode(value: string | undefined): value is WidgetMode {
  return value === "launcher" || value === "inline";
}

function isPosition(value: string | undefined): value is WidgetPosition {
  return value === "bottom-right" || value === "bottom-left";
}

function isTheme(value: string | undefined): value is WidgetTheme {
  return value === "auto" || value === "light" || value === "dark";
}

export default async function EmbedPreviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const client = sanitizeClientId(readParam(sp, "client")) || DEFAULT_CLIENT_ID;
  const modeRaw = readParam(sp, "mode");
  const mode: WidgetMode = isMode(modeRaw) ? modeRaw : "launcher";
  const color = readParam(sp, "color");
  const positionRaw = readParam(sp, "position");
  const position = isPosition(positionRaw) ? positionRaw : undefined;
  const themeRaw = readParam(sp, "theme");
  const theme = isTheme(themeRaw) ? themeRaw : undefined;
  const greeting = readParam(sp, "greeting");

  // The preview always mounts inline content into one concrete stub element —
  // the operator's real `data-target` selector is snippet-only (it targets a
  // spot on THEIR page, which we can't preview); here we always give it one.
  const target = mode === "inline" ? `#${PREVIEW_TARGET_ID}` : undefined;

  const overrides: Record<string, unknown> = { client, mode };
  if (target) overrides.target = target;
  if (color) overrides.color = color;
  if (position) overrides.position = position;
  if (theme) overrides.theme = theme;
  if (greeting) overrides.greeting = greeting;

  // Preview == production for starters too: fetch the tenant's real
  // /api/widget-config chips server-side and pass them as the window.CadreChat
  // override, the same public, already-CORS'd, already-rate-safe endpoint a
  // deployed widget reads on boot.
  try {
    const hdrs = await headers();
    const host = hdrs.get("host");
    const proto = hdrs.get("x-forwarded-proto") ?? "https";
    if (host) {
      const origin = `${proto}://${host}`;
      const res = await fetch(`${origin}/api/widget-config?client=${encodeURIComponent(client)}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data: unknown = await res.json();
        const starters =
          data && typeof data === "object" && Array.isArray((data as { starters?: unknown }).starters)
            ? (data as { starters: string[] }).starters
            : null;
        if (starters && starters.length > 0) overrides.starters = starters;
      }
    }
  } catch {
    // Best-effort — the widget's own DEFAULT_STARTERS fallback still applies.
  }

  // `<script>` written directly as JSX (not next/script): the inline config
  // script has no `src`, so the parser executes it synchronously the instant
  // it's encountered — strictly BEFORE it even starts fetching the later
  // `async` widget.js tag. window.CadreChat is always set before boot() runs.
  const configJson = JSON.stringify(overrides).replace(/</g, "\\u003c");

  return (
    <>
      {mode === "inline" && <div id={PREVIEW_TARGET_ID} style={{ minHeight: 480 }} />}
      <script dangerouslySetInnerHTML={{ __html: `window.CadreChat = ${configJson};` }} />
      <script src="/widget.js" async />
    </>
  );
}
