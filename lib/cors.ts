// CORS + origin allowlist for cross-origin widget embeds.
//
// ALLOWED_ORIGINS: comma-separated list of allowed origins, or "*"/unset to
// allow all (the dev/current default, so nothing breaks until locked down).
// Requests without an Origin header (curl, server-to-server) are always allowed
// — CORS is a browser mechanism; non-browser abuse is handled by the rate
// limiter, not here. Same-origin requests (the app's own UI) are always allowed
// so locking ALLOWED_ORIGINS to widget hosts never 403s the app itself.

const ALLOWED = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ALLOW_ALL = ALLOWED.length === 0 || ALLOWED.includes("*");

function isSameOrigin(origin: string, host: string | null | undefined): boolean {
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function isOriginAllowed(
  origin: string | null,
  host?: string | null,
): boolean {
  if (!origin) return true; // no browser Origin (curl / server-to-server)
  if (ALLOW_ALL) return true;
  if (isSameOrigin(origin, host)) return true; // the app's own UI
  return ALLOWED.includes(origin);
}

export function corsHeaders(
  origin: string | null,
  host?: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    // Let the embeddable widget read the guardrail metadata cross-origin.
    "Access-Control-Expose-Headers":
      "x-cadre-mode, x-cadre-reason, x-cadre-sources, x-cadre-topscore",
    Vary: "Origin",
  };
  if (origin && isOriginAllowed(origin, host)) {
    headers["Access-Control-Allow-Origin"] = origin;
  } else if (ALLOW_ALL) {
    headers["Access-Control-Allow-Origin"] = "*";
  }
  return headers;
}
