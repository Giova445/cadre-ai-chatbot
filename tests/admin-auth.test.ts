// Admin auth unit tests. Exercises the crypto core only (signSession /
// verifySession / verifyPassword) — these never touch next/headers or
// next/navigation, so the module imports cleanly in the vitest node env where
// Web Crypto (globalThis.crypto.subtle) is available.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  signSession,
  verifySession,
  verifyPassword,
} from "@/lib/admin/auth";
import type { AdminSession } from "@/lib/admin/contracts";

// Flip the first char of a base64url segment (deterministic tamper).
function tamperSegment(segment: string): string {
  const replacement = segment[0] === "A" ? "B" : "A";
  return replacement + segment.slice(1);
}

describe("session token: sign → verify round-trip", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_SESSION_SECRET", "test-signing-secret");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("verifies a freshly signed payload and returns it unchanged", async () => {
    const payload: AdminSession = { authenticated: true, issuedAt: 1_700_000_000_000 };
    const token = await signSession(payload);

    // Shape: two base64url segments joined by a dot.
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

    const verified = await verifySession(token);
    expect(verified).toEqual(payload);
  });

  it("returns null for a token with a tampered payload segment", async () => {
    const token = await signSession({ authenticated: true, issuedAt: Date.now() });
    const [payload, signature] = token.split(".");
    const tampered = `${tamperSegment(payload)}.${signature}`;

    expect(await verifySession(tampered)).toBeNull();
  });

  it("returns null for a token with a tampered signature segment", async () => {
    const token = await signSession({ authenticated: true, issuedAt: Date.now() });
    const [payload, signature] = token.split(".");
    const tampered = `${payload}.${tamperSegment(signature)}`;

    expect(await verifySession(tampered)).toBeNull();
  });

  it("returns null for a token signed under a different secret", async () => {
    const token = await signSession({ authenticated: true, issuedAt: Date.now() });
    vi.stubEnv("ADMIN_SESSION_SECRET", "a-completely-different-secret");

    expect(await verifySession(token)).toBeNull();
  });

  it("returns null for malformed / empty tokens", async () => {
    expect(await verifySession("")).toBeNull();
    expect(await verifySession("not-a-token")).toBeNull();
    expect(await verifySession("only.two.parts.here")).toBeNull();
    expect(await verifySession("!!!.@@@")).toBeNull();
  });
});

describe("verifyPassword", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns true for the correct password", () => {
    vi.stubEnv("ADMIN_PASSWORD", "secret");
    expect(verifyPassword("secret")).toBe(true);
  });

  it("returns false for an incorrect or empty guess", () => {
    vi.stubEnv("ADMIN_PASSWORD", "secret");
    expect(verifyPassword("wrong")).toBe(false);
    expect(verifyPassword("secre")).toBe(false);
    expect(verifyPassword("secret ")).toBe(false);
    expect(verifyPassword("")).toBe(false);
  });

  it("is locked (false) when ADMIN_PASSWORD is empty", () => {
    vi.stubEnv("ADMIN_PASSWORD", "");
    expect(verifyPassword("")).toBe(false);
    expect(verifyPassword("anything")).toBe(false);
  });

  it("is locked (false) when ADMIN_PASSWORD is unset", () => {
    vi.stubEnv("ADMIN_PASSWORD", undefined as unknown as string);
    expect(verifyPassword("anything")).toBe(false);
  });
});
