// The deterministic guardrail: the layer that decides answer / refuse / escalate
// before any LLM is involved. Retrieved[] fixtures are built inline from minimal
// Chunk objects, so no embeddings artifact is needed.

import { describe, it, expect } from "vitest";
import { decide } from "@/lib/guardrail";
import type { Chunk, Retrieved } from "@/lib/types";

function makeChunk(source: string): Chunk {
  return {
    id: `${source}#0`,
    text: `body of ${source}`,
    embedding: [1, 0, 0],
    meta: {
      source,
      title: source.replace(/\.md$/, ""),
      section: "Overview",
      tags: [],
    },
  };
}

function retrieved(source: string, score: number): Retrieved {
  return { chunk: makeChunk(source), score };
}

describe("decide", () => {
  it("refuses pricing questions with reason 'pricing'", () => {
    const results = [retrieved("services.md", 0.5)];
    const d = decide("how much does it cost", results);
    expect(d.mode).toBe("refuse");
    expect(d.reason).toBe("pricing");
  });

  it("escalates explicit human requests with reason 'human_request'", () => {
    const results = [retrieved("services.md", 0.5)];
    const d = decide("can I talk to a human", results);
    expect(d.mode).toBe("escalate");
    expect(d.reason).toBe("human_request");
  });

  it("escalates empty retrieval with reason 'weak_retrieval'", () => {
    const d = decide("something completely unrelated", []);
    expect(d.mode).toBe("escalate");
    expect(d.reason).toBe("weak_retrieval");
    expect(d.citations).toEqual([]);
    expect(d.topScore).toBe(0);
  });

  it("answers a neutral question when retrieval is strong", () => {
    const results = [
      retrieved("ai-maturity-index.md", 0.9),
      retrieved("what-cadre-does.md", 0.4),
    ];
    const d = decide("What is the AI Maturity Index?", results);
    expect(d.mode).toBe("answer");
    expect(d.reason).toBe("grounded");
    expect(d.topScore).toBeCloseTo(0.9, 10);
    expect(d.citations).toContain("ai-maturity-index.md");
  });
});
