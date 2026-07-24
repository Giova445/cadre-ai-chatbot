// Client (tenant) registry. Resolves an UNTRUSTED body `client` value into a
// canonical tenant id for logging. The request body is attacker-controlled, so a
// raw `client` is never trusted: it is checked against CLIENT_REGISTRY and, when
// configured, the browser Origin. Fail-closed to "default" (the single-tenant
// bucket) — NEVER to another tenant. Security lives on the Origin allowlist
// (lib/cors.ts); `client` is only a routing/logging label.
//
// CLIENT_REGISTRY (env) format:
//   "acme:https://acme.com|https://www.acme.com,beta:https://beta.io"
//   clientId ":" origin ("|" origin)*  ("," ...)   — a client with no origins
//   listed (e.g. "beta:") accepts any origin.
// Unset/empty ⇒ no registry ⇒ dev/allow-all parity: a sanitized body `client` is
// accepted as-is (mirrors ALLOWED_ORIGINS allow-all). Configure it before GA.

export const DEFAULT_CLIENT_ID = "default";
const MAX_CLIENT_LEN = 64;

/** Canonicalize a client id to a safe slug; "" when nothing usable remains. */
export function sanitizeClientId(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, MAX_CLIENT_LEN);
}

function parseRegistry(raw: string): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const entry of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    const idx = entry.indexOf(":");
    const id = idx === -1 ? entry : entry.slice(0, idx);
    const originsRaw = idx === -1 ? "" : entry.slice(idx + 1);
    const clientId = sanitizeClientId(id);
    if (!clientId) continue;
    const origins = new Set(
      originsRaw.split("|").map((o) => o.trim()).filter(Boolean),
    );
    map.set(clientId, origins);
  }
  return map;
}

const REGISTRY = parseRegistry(process.env.CLIENT_REGISTRY ?? "");

export function isKnownClient(id: string): boolean {
  return REGISTRY.has(id);
}

/**
 * The registry's id list (for the admin embed panel's client dropdown — the
 * union of "configured" ids here and "live" ids from clientRepo.listClients(),
 * per docs/product/admin-embed-and-sitemap.md § A6). Empty when CLIENT_REGISTRY
 * is unset (dev/allow-all parity). Does not change resolveClient's behavior.
 */
export function listRegisteredClients(): { id: string; origins: string[] }[] {
  return Array.from(REGISTRY.entries()).map(([id, origins]) => ({
    id,
    origins: Array.from(origins),
  }));
}

/**
 * Resolve an untrusted body `client` (+ browser Origin) to a canonical tenant id.
 *  - no client                 ⇒ "default"
 *  - no registry configured    ⇒ the sanitized client (dev/allow-all parity)
 *  - registry configured       ⇒ client must be KNOWN and, if it lists origins and
 *    an Origin is present, the Origin must match; otherwise "default" (fail-closed).
 */
export function resolveClient(input: {
  client?: string | null;
  origin?: string | null;
}): string {
  const client = sanitizeClientId(input.client);
  if (!client) return DEFAULT_CLIENT_ID;
  if (REGISTRY.size === 0) return client; // unconfigured → trust in dev/allow-all
  const origins = REGISTRY.get(client);
  if (!origins) return DEFAULT_CLIENT_ID; // unknown client → fail closed
  if (origins.size > 0 && input.origin && !origins.has(input.origin)) {
    return DEFAULT_CLIENT_ID; // origin/client mismatch → fail closed
  }
  return client;
}
