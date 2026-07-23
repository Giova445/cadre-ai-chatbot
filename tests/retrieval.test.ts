// Pure retrieval core: cosine similarity, top-k ranking, weak-retrieval test.
// Uses hand-built fixtures only — never imports lib/kb.ts or data/embeddings.json,
// so these tests run without the generated artifact.

import { describe, it, expect } from "vitest";
import {
  cosineSimilarity,
  rankChunks,
  isWeak,
} from "@/lib/retrieval";
import type { Chunk, EmbeddingsFile, Retrieved } from "@/lib/types";

function makeChunk(id: string, embedding: number[]): Chunk {
  return {
    id,
    text: `text-${id}`,
    embedding,
    meta: {
      source: `${id}.md`,
      title: `Title ${id}`,
      section: "Overview",
      tags: [],
    },
  };
}

function makeFile(chunks: Chunk[]): EmbeddingsFile {
  return {
    model: "lexical-hash-512",
    dimensions: 3,
    builtAt: "2026-01-01T00:00:00.000Z",
    thresholdHint: 0.08,
    idf: {},
    chunks,
  };
}

describe("cosineSimilarity", () => {
  it("returns ~1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
  });

  it("returns ~1 for parallel (scaled) vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 10);
  });

  it("returns ~0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  it("returns ~-1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1, 10);
  });

  it("returns 0 when either vector is all zeros (no divide-by-zero)", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });
});

describe("rankChunks", () => {
  const query = [1, 0, 0];
  const a = makeChunk("a", [1, 0, 0]); // cosine 1.0
  const b = makeChunk("b", [0.6, 0.8, 0]); // cosine 0.6
  const c = makeChunk("c", [0, 0, 1]); // cosine 0.0
  // Deliberately unsorted input to prove the ranker sorts.
  const file = makeFile([c, a, b]);

  it("returns chunks sorted by score descending", () => {
    const ranked = rankChunks(file, query);
    expect(ranked.map((r) => r.chunk.id)).toEqual(["a", "b", "c"]);
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
    expect(ranked[1].score).toBeGreaterThanOrEqual(ranked[2].score);
    expect(ranked[0].score).toBeCloseTo(1, 10);
    expect(ranked[1].score).toBeCloseTo(0.6, 10);
    expect(ranked[2].score).toBeCloseTo(0, 10);
  });

  it("respects k by returning only the top-k highest scorers", () => {
    const ranked = rankChunks(file, query, 2);
    expect(ranked).toHaveLength(2);
    expect(ranked.map((r) => r.chunk.id)).toEqual(["a", "b"]);
  });
});

describe("isWeak", () => {
  const strong: Retrieved[] = [{ chunk: makeChunk("s", [1, 0, 0]), score: 0.7 }];
  const faint: Retrieved[] = [{ chunk: makeChunk("f", [1, 0, 0]), score: 0.3 }];

  it("is true when there are no results", () => {
    expect(isWeak([], 0.5)).toBe(true);
  });

  it("is true when the top score is below the threshold", () => {
    expect(isWeak(faint, 0.5)).toBe(true);
  });

  it("is false when the top score is at or above the threshold", () => {
    expect(isWeak(strong, 0.5)).toBe(false);
    expect(isWeak(strong, 0.7)).toBe(false); // boundary: equal is not weak
  });
});
