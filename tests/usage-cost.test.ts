import { describe, it, expect } from "vitest";
import { computeCost, nanoToUsd } from "@/lib/usage/cost";
import { rateFor } from "@/lib/usage/pricing";

// Numbers below are the REAL usage returned by a live OpenAI call
// (scripts/probe-usage.ts): a gpt-4o-mini reply reported inputTokens:14,
// outputTokens:3; an embedding reported tokens:8. Costs are hand-derived from
// OpenAI's published per-token rates — this pins the formula to reality.
describe("computeCost — table path (OpenAI, verified against live usage)", () => {
  it("chat gpt-4o-mini 14 in / 3 out = 3900 nano-USD ($0.0000039)", () => {
    // 14 × $0.15/1M + 3 × $0.60/1M = 2100 + 1800 = 3900 nano
    const c = computeCost({ clientId: "x", conversationId: null, kind: "chat", model: "gpt-4o-mini", inputTokens: 14, outputTokens: 3 });
    expect(c.costNanoUsd).toBe(3900);
    expect(c.costSource).toBe("table_estimated");
    expect(nanoToUsd(c.costNanoUsd)).toBeCloseTo(0.0000039, 12);
  });

  it("embedding text-embedding-3-small 8 tokens = 160 nano-USD", () => {
    // 8 × $0.02/1M = 160 nano; output side is 0 for embeddings
    const c = computeCost({ clientId: "x", conversationId: null, kind: "embedding", model: "text-embedding-3-small", inputTokens: 8 });
    expect(c.costNanoUsd).toBe(160);
  });

  it("prefers provider-reported cost (OpenRouter usage.cost) when present", () => {
    const c = computeCost({ clientId: "x", conversationId: null, kind: "chat", model: "openai/gpt-4o-mini", inputTokens: 999, outputTokens: 999, rawCostUsd: 0.000042 });
    expect(c.costSource).toBe("provider_reported");
    expect(c.costNanoUsd).toBe(42000);
  });

  it("applies the cached-input discount", () => {
    // 100 cached tokens × $0.075/1M = 7500 nano-USD; no output
    const c = computeCost({ clientId: "x", conversationId: null, kind: "chat", model: "gpt-4o-mini", inputTokens: 100, cachedInputTokens: 100 });
    expect(c.costNanoUsd).toBe(7500);
  });

  it("coalesces undefined tokens to 0 (never NaN)", () => {
    const c = computeCost({ clientId: "x", conversationId: null, kind: "chat", model: "gpt-4o-mini", inputTokens: undefined as unknown as number });
    expect(c.costNanoUsd).toBe(0);
  });

  it("unknown model → 0, table_estimated", () => {
    const c = computeCost({ clientId: "x", conversationId: null, kind: "chat", model: "made-up-model", inputTokens: 100, outputTokens: 100 });
    expect(c).toEqual({ costNanoUsd: 0, costSource: "table_estimated" });
  });

  it("strips an openrouter openai/ prefix in rateFor", () => {
    expect(rateFor("openai/gpt-4o-mini")?.inputPerMTokUsd).toBe(0.15);
  });
});
