// Admin auth — a signed-cookie gate keyed by ADMIN_PASSWORD (single internal
// admin). Defense-in-depth: the REAL check is requireAdmin() called server-side
// in every admin route/RSC. Middleware is UX only and is NOT a trust boundary
// (a crafted request can skip Next.js middleware — the CVE-2025-29927 lesson).
//
// Edge-safe by construction: HMAC-SHA256 via Web Crypto (globalThis.crypto),
// NO node:crypto, no new deps. next/headers and next/navigation are imported
// DYNAMICALLY inside the two functions that need them so the crypto core stays
// out of the module's static import graph — that keeps this file importable in a
// plain Node/vitest env (server-only would otherwise throw at import time) and
// keeps the signing primitives usable from the Edge runtime.

import { ADMIN_COOKIE, type AdminSession } from "./contracts";

const EIGHT_HOURS_SECONDS = 60 * 60 * 8;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ---------------------------------------------------------------------------
// base64url helpers (no padding) — over raw bytes and via btoa/atob (edge-safe)
// ---------------------------------------------------------------------------
function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64.length % 4 === 0 ? b64 : b64 + "=".repeat(4 - (b64.length % 4));
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

// ---------------------------------------------------------------------------
// HMAC + constant-time comparison
// ---------------------------------------------------------------------------

/** Signing key = ADMIN_SESSION_SECRET, falling back to ADMIN_PASSWORD, then "". */
function signingSecret(): string {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || "";
}

// Import the key fresh each call (never cached) so env changes — including
// per-test stubbing — always take effect.
async function hmac(data: string): Promise<Uint8Array> {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(signingSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await globalThis.crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return new Uint8Array(sig);
}

/** Constant-time byte compare. Length differs → false (HMACs are fixed length). */
function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Constant-time-ish string compare without node:crypto. Folds the length delta
// in and always walks the longer buffer so a wrong guess can't be distinguished
// by early exit. (JS can't fully hide the secret's length here; acceptable for a
// single internal password gate.)
function timingSafeEqualString(a: string, b: string): boolean {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Session tokens — format: base64url(JSON payload) "." base64url(HMAC over seg0)
// ---------------------------------------------------------------------------

/** Sign a session payload into `base64url(JSON).base64url(hmac)`. */
export async function signSession(payload: AdminSession): Promise<string> {
  const payloadSegment = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = bytesToBase64Url(await hmac(payloadSegment));
  return `${payloadSegment}.${signature}`;
}

function isAdminSession(value: unknown): value is AdminSession {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>).authenticated === true &&
    typeof (value as Record<string, unknown>).issuedAt === "number"
  );
}

/**
 * Recompute the HMAC over the payload segment, constant-time compare against the
 * supplied signature, then parse. Returns null on any mismatch, malformed token,
 * bad base64, parse error, or shape mismatch. Never throws.
 */
export async function verifySession(token: string): Promise<AdminSession | null> {
  try {
    if (typeof token !== "string" || token.length === 0) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payloadSegment, signatureSegment] = parts;
    if (!payloadSegment || !signatureSegment) return null;

    const expected = await hmac(payloadSegment);
    const provided = base64UrlToBytes(signatureSegment);
    if (!timingSafeEqualBytes(expected, provided)) return null;

    const parsed: unknown = JSON.parse(decoder.decode(base64UrlToBytes(payloadSegment)));
    return isAdminSession(parsed) ? { authenticated: true, issuedAt: parsed.issuedAt } : null;
  } catch {
    return null;
  }
}

/**
 * Constant-time compare against ADMIN_PASSWORD. Locked by default: if the env var
 * is unset or empty, always returns false. Never logs the password.
 */
export function verifyPassword(pw: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false; // locked by default
  if (typeof pw !== "string") return false;
  return timingSafeEqualString(pw, expected);
}

/** Mint a fresh session token for a just-authenticated admin. */
export function createSessionToken(): Promise<string> {
  return signSession({ authenticated: true, issuedAt: Date.now() });
}

/**
 * Read + verify the admin cookie. Non-redirecting: returns the session or null.
 * next/headers is imported dynamically (keeps server-only out of the static
 * import graph — see the file header).
 */
export async function readAdminSession(): Promise<AdminSession | null> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/**
 * The gate every admin page/route calls. Verifies server-side; on no/invalid
 * session it redirects to the login page (redirect() throws, so this never
 * returns null). This — not middleware — is the security boundary.
 */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await readAdminSession();
  if (session) return session;
  const { redirect } = await import("next/navigation");
  redirect("/admin/login"); // redirect() throws to abort rendering...
  throw new Error("unreachable"); // ...so this is never hit (satisfies TS).
}

/** Cookie options for the admin session (shared by login/logout). */
export const ADMIN_COOKIE_MAX_AGE = EIGHT_HOURS_SECONDS;
