// Bound KB loader. Statically imports the generated embeddings artifact so the
// bundler ships it with the deployment (read-only). Imported by the API route
// only — NOT by the pure retrieval core or unit tests, so tests need no artifact.

import type { EmbeddingsFile, Retrieved } from "./types";
import { rankChunks } from "./retrieval";
import { TOP_K } from "./config";
import embeddingsJson from "@/data/embeddings.json";

const KB = embeddingsJson as unknown as EmbeddingsFile;

export function getKB(): EmbeddingsFile {
  return KB;
}

export function retrieve(queryVec: number[], k: number = TOP_K): Retrieved[] {
  return rankChunks(KB, queryVec, k);
}
