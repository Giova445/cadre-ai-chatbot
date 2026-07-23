// retrieveTextWithUsage branch/provider selection. Runs against the bundled
// (lexical) artifact — the offline default — so no keys or mocks are needed.
// Asserts the lexical path reports zero embedding spend and stays behaviourally
// identical to retrieveText (which the eval depends on and must not change).

import { describe, it, expect } from "vitest";
import { retrieveText, retrieveTextWithUsage } from "@/lib/kb";

describe("retrieveTextWithUsage (lexical/offline artifact)", () => {
  it("reports provider 'lexical' and zero embed tokens (no spend offline)", async () => {
    const usage = await retrieveTextWithUsage("what services do you offer");
    expect(usage.provider).toBe("lexical");
    expect(usage.embedTokens).toBe(0);
  });

  it("returns the same ranked results as retrieveText (behaviour parity)", async () => {
    const query = "how does onboarding work";
    const plain = await retrieveText(query);
    const withUsage = await retrieveTextWithUsage(query);
    expect(withUsage.results.map((r) => r.chunk.id)).toEqual(
      plain.map((r) => r.chunk.id),
    );
    expect(withUsage.results.map((r) => r.score)).toEqual(
      plain.map((r) => r.score),
    );
  });

  it("honours the k argument", async () => {
    const { results } = await retrieveTextWithUsage("pricing plans", 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });
});
