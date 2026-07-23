// Bound KB loader. Statically imports the generated embeddings artifact so the
// bundler ships it with the deployment (read-only). Imported by the API route
// and the eval runner only — NOT by the pure retrieval core or unit tests, so
// tests need no artifact.

import type { EmbeddingsFile, Retrieved } from "./types";
import { rankChunks } from "./retrieval";
import { TOP_K, LEXICAL_MODEL, HAS_CHAT_KEY } from "./config";
import { lexicalEmbed, embedQueryReal } from "./llm";
import embeddingsJson from "@/data/embeddings.json";

const KB = embeddingsJson as unknown as EmbeddingsFile;

// Follow the ARTIFACT's model, never env flags: if the chunks are lexical, embed
// the query lexically; if real, embed the query with real embeddings. This makes
// the query and chunk embedders always match (no lexical-vs-real mismatch even
// when an embeddings key happens to be set with a lexical artifact).
const KB_IS_LEXICAL = KB.model === LEXICAL_MODEL;

// Effective answer/escalate cutoff. When a chat model is present the LLM is the
// arbiter, so keep the bar LOW and let it ground legit queries / decline
// off-topic via its scope rule (short vague queries score low even with real
// embeddings, so a high bar wrongly escalates them). Only OFFLINE (no LLM) do we
// gate deterministically, tuned per embedder.
export const EFFECTIVE_THRESHOLD = Number(
  process.env.RETRIEVAL_THRESHOLD ??
    (HAS_CHAT_KEY ? "0.05" : KB_IS_LEXICAL ? "0.20" : "0.35"),
);

export function getKB(): EmbeddingsFile {
  return KB;
}

/** Rank against a precomputed query vector. */
export function retrieve(queryVec: number[], k: number = TOP_K): Retrieved[] {
  return rankChunks(KB, queryVec, k);
}

/**
 * Embed a query (using the artifact's IDF weights for the lexical embedder) and
 * return the top-k chunks. This is the primary entry point for the route/eval.
 */
export async function retrieveText(
  query: string,
  k: number = TOP_K,
): Promise<Retrieved[]> {
  const vec = KB_IS_LEXICAL
    ? lexicalEmbed(query, KB.idf)
    : await embedQueryReal(query);
  return rankChunks(KB, vec, k);
}
