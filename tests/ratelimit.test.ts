import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("rateLimit (default MAX=30)", () => {
  it("allows up to the limit then blocks", async () => {
    const { rateLimit } = await import("@/lib/ratelimit");
    const key = `k-${Math.random()}`; // fresh bucket
    let blocked = 0;
    for (let i = 0; i < 31; i++) if (!rateLimit(key).ok) blocked++;
    // 30 allowed, the 31st (and any beyond) blocked
    expect(blocked).toBe(1);
  });

  it("keeps separate buckets per key", async () => {
    const { rateLimit } = await import("@/lib/ratelimit");
    expect(rateLimit(`a-${Math.random()}`).ok).toBe(true);
    expect(rateLimit(`b-${Math.random()}`).ok).toBe(true);
  });
});

describe("rateLimit disabled (RATE_LIMIT_PER_MIN=0)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("RATE_LIMIT_PER_MIN", "0");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("never blocks when disabled", async () => {
    const { rateLimit } = await import("@/lib/ratelimit");
    const key = "disabled";
    for (let i = 0; i < 100; i++) expect(rateLimit(key).ok).toBe(true);
  });
});
