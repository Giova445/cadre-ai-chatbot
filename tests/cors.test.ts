import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("cors — allow-all default (ALLOWED_ORIGINS unset)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("ALLOWED_ORIGINS", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("allows any origin and reflects it", async () => {
    const { isOriginAllowed, corsHeaders } = await import("@/lib/cors");
    expect(isOriginAllowed("https://anything.example", null)).toBe(true);
    expect(corsHeaders("https://anything.example", null)["Access-Control-Allow-Origin"]).toBe(
      "https://anything.example",
    );
  });

  it("allows requests without an Origin (curl / server)", async () => {
    const { isOriginAllowed } = await import("@/lib/cors");
    expect(isOriginAllowed(null, null)).toBe(true);
  });
});

describe("cors — locked down (ALLOWED_ORIGINS set)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("ALLOWED_ORIGINS", "https://acme.com,https://www.acme.com");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("allows a listed origin", async () => {
    const { isOriginAllowed } = await import("@/lib/cors");
    expect(isOriginAllowed("https://acme.com", "cadre.app")).toBe(true);
  });

  it("blocks an unlisted cross-origin", async () => {
    const { isOriginAllowed, corsHeaders } = await import("@/lib/cors");
    expect(isOriginAllowed("https://evil.com", "cadre.app")).toBe(false);
    // no ACAO echoed for a disallowed origin when locked down
    expect(corsHeaders("https://evil.com", "cadre.app")["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("always allows same-origin (Origin host === request host), even if unlisted", async () => {
    const { isOriginAllowed } = await import("@/lib/cors");
    expect(isOriginAllowed("https://cadre.app", "cadre.app")).toBe(true);
  });

  it("exposes the x-cadre-* metadata headers", async () => {
    const { corsHeaders } = await import("@/lib/cors");
    expect(corsHeaders("https://acme.com", "cadre.app")["Access-Control-Expose-Headers"]).toContain(
      "x-cadre-sources",
    );
  });
});
