import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Chunk, Retrieved } from "@/lib/types";

function chunk(source: string, text: string): Chunk {
  return {
    id: `${source}#0`,
    text,
    embedding: [1, 0, 0],
    meta: { source, title: source, section: "Overview", tags: [] },
  };
}

// The grounding-coverage guard is offline-only (gated on HAS_CHAT_KEY), so force
// the keyless config deterministically regardless of the ambient environment.
describe("decide — coverage guard (offline)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("AI_CHAT_API_KEY", "");
    vi.stubEnv("EMBEDDINGS_API_KEY", "");
    vi.stubEnv("RETRIEVAL_THRESHOLD", "0.2");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("refuses with reason 'unsupported' when distinctive query terms are absent from strong retrieval", async () => {
    const { decide } = await import("@/lib/guardrail");
    const results: Retrieved[] = [
      { chunk: chunk("services.md", "We offer AI strategy and engineering services."), score: 0.6 },
    ];
    const d = decide("Do you sell zorblatt hyperdrive turbo units?", results);
    expect(d.mode).toBe("refuse");
    expect(d.reason).toBe("unsupported");
  });

  it("answers when the query's terms ARE present in the retrieved context", async () => {
    const { decide } = await import("@/lib/guardrail");
    const results: Retrieved[] = [
      { chunk: chunk("services.md", "Our engineering services build custom AI agents."), score: 0.6 },
    ];
    const d = decide("What engineering services do you build?", results);
    expect(d.mode).toBe("answer");
    expect(d.reason).toBe("grounded");
  });
});
