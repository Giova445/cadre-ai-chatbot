// The offline deterministic lexical embedder. Verifies the invariants the whole
// RAG pipeline relies on: determinism, fixed dimensionality, unit norm, and that
// lexical overlap maps to higher cosine similarity.

import { describe, it, expect } from "vitest";
import { lexicalEmbed } from "@/lib/llm";
import { cosineSimilarity, magnitude } from "@/lib/retrieval";
import { EMBED_DIMENSIONS } from "@/lib/config";

describe("lexicalEmbed", () => {
  it("is deterministic: same input yields an identical vector", () => {
    const a = lexicalEmbed("Cadre applied artificial intelligence consulting");
    const b = lexicalEmbed("Cadre applied artificial intelligence consulting");
    expect(a).toEqual(b);
  });

  it("always produces a vector of length EMBED_DIMENSIONS (512)", () => {
    expect(EMBED_DIMENSIONS).toBe(512);
    expect(lexicalEmbed("short text").length).toBe(512);
    expect(
      lexicalEmbed(
        "a much longer piece of text with many distinct tokens describing services and strategy",
      ).length,
    ).toBe(512);
  });

  it("is L2-normalized to unit magnitude for non-empty input", () => {
    const v = lexicalEmbed("machine learning models and data pipelines");
    expect(magnitude(v)).toBeCloseTo(1, 10);
  });

  it("scores lexically overlapping texts higher than unrelated texts", () => {
    const base = lexicalEmbed("machine learning models data pipeline deployment");
    const overlapping = lexicalEmbed(
      "machine learning models data training workflow",
    );
    const unrelated = lexicalEmbed("restaurant cuisine flavor dessert recipe");

    const simOverlap = cosineSimilarity(base, overlapping);
    const simUnrelated = cosineSimilarity(base, unrelated);

    expect(simOverlap).toBeGreaterThan(simUnrelated);
    expect(simOverlap).toBeGreaterThan(0);
  });
});
