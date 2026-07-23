import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("resolveClient — no registry (dev/allow-all parity)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("CLIENT_REGISTRY", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("returns 'default' when no client is given", async () => {
    const { resolveClient, DEFAULT_CLIENT_ID } = await import("@/lib/clients");
    expect(resolveClient({})).toBe(DEFAULT_CLIENT_ID);
  });
  it("accepts a sanitized client id when unconfigured", async () => {
    const { resolveClient } = await import("@/lib/clients");
    expect(resolveClient({ client: "Acme!!" })).toBe("acme"); // slugified
  });
});

describe("resolveClient — registry configured (fail-closed)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("CLIENT_REGISTRY", "acme:https://acme.com|https://www.acme.com,beta:");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("accepts a known client with a matching origin", async () => {
    const { resolveClient } = await import("@/lib/clients");
    expect(resolveClient({ client: "acme", origin: "https://acme.com" })).toBe("acme");
  });
  it("fails closed to 'default' for an unknown client", async () => {
    const { resolveClient, DEFAULT_CLIENT_ID } = await import("@/lib/clients");
    expect(resolveClient({ client: "evil", origin: "https://acme.com" })).toBe(DEFAULT_CLIENT_ID);
  });
  it("fails closed on an origin/client mismatch", async () => {
    const { resolveClient, DEFAULT_CLIENT_ID } = await import("@/lib/clients");
    expect(resolveClient({ client: "acme", origin: "https://evil.com" })).toBe(DEFAULT_CLIENT_ID);
  });
  it("a known client with no origins listed accepts any origin", async () => {
    const { resolveClient } = await import("@/lib/clients");
    expect(resolveClient({ client: "beta", origin: "https://anywhere.com" })).toBe("beta");
  });
});
