// Pure retrieval core: cosine similarity + top-k ranking + weak-retrieval test.
// No I/O, no JSON import — trivially unit-testable with fixtures. The bound
// loader lives in lib/kb.ts.

import type { EmbeddingsFile, Retrieved } from "./types";
import { RETRIEVAL_THRESHOLD, TOP_K } from "./config";

export function dot(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export function magnitude(a: number[]): number {
  let s = 0;
  for (const v of a) s += v * v;
  return Math.sqrt(s);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const denom = magnitude(a) * magnitude(b);
  if (denom === 0) return 0;
  return dot(a, b) / denom;
}

/** Rank all chunks in `file` against `queryVec`, return the top `k`. */
export function rankChunks(
  file: EmbeddingsFile,
  queryVec: number[],
  k: number = TOP_K,
): Retrieved[] {
  const scored: Retrieved[] = file.chunks.map((chunk) => ({
    chunk,
    score: cosineSimilarity(queryVec, chunk.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

/** True when retrieval is too weak to ground an answer (escalate instead). */
export function isWeak(
  results: Retrieved[],
  threshold: number = RETRIEVAL_THRESHOLD,
): boolean {
  return results.length === 0 || results[0].score < threshold;
}
