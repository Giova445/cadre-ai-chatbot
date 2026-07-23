// Bound KB loader. Statically imports the generated embeddings artifact so the
// bundler ships it with the deployment (read-only). Imported by the API route
// and the eval runner only — NOT by the pure retrieval core or unit tests, so
// tests need no artifact.

import type { EmbeddingsFile, Retrieved } from "./types";
import { rankChunks } from "./retrieval";
import { TOP_K, LEXICAL_MODEL, HAS_CHAT_KEY, RETRIEVAL_BACKEND } from "./config";
import { lexicalEmbed, embedQueryReal, embedQueryRealWithUsage } from "./llm";
import embeddingsJson from "@/data/embeddings.json";

const KB = embeddingsJson as unknown as EmbeddingsFile;

// Follow the ARTIFACT's model, never env flags: if the chunks are lexical, embed
// the query lexically; if real, embed the query with real embeddings. This makes
// the query and chunk embedders always match (no lexical-vs-real mismatch even
// when an embeddings key happens to be set with a lexical artifact).
const KB_IS_LEXICAL = KB.model === LEXICAL_MODEL;

// The pgvector backend always retrieves via REAL embeddings, regardless of the
// bundled artifact's model. So the effective embedder is lexical ONLY when the
// bundle backend is serving a lexical artifact — this drives the offline cutoff
// below (real scores separate ~0.35; lexical ~0.20).
const RETRIEVAL_IS_LEXICAL = KB_IS_LEXICAL && RETRIEVAL_BACKEND !== "pgvector";

// Effective answer/escalate cutoff. When a chat model is present the LLM is the
// arbiter, so keep the bar LOW and let it ground legit queries / decline
// off-topic via its scope rule (short vague queries score low even with real
// embeddings, so a high bar wrongly escalates them). Only OFFLINE (no LLM) do we
// gate deterministically, tuned per embedder.
export const EFFECTIVE_THRESHOLD = Number(
  process.env.RETRIEVAL_THRESHOLD ??
    (HAS_CHAT_KEY ? "0.05" : RETRIEVAL_IS_LEXICAL ? "0.20" : "0.35"),
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
  // pgvector backend: rank in Postgres. Real-embeddings only, so the query is
  // embedded with the same model the DB was seeded with. Dynamically imported so
  // the default `bundle` path never loads `postgres`.
  if (RETRIEVAL_BACKEND === "pgvector") {
    const vec = await embedQueryReal(query);
    const { retrievePgvector } = await import("./retrieval-pgvector");
    return retrievePgvector(vec, k);
  }

  // bundle backend (default): in-memory cosine over the build-time artifact,
  // following the artifact's embedder (lexical or real) so query/chunk match.
  const vec = KB_IS_LEXICAL
    ? lexicalEmbed(query, KB.idf)
    : await embedQueryReal(query);
  return rankChunks(KB, vec, k);
}

/**
 * Usage-aware sibling of {@link retrieveText}: identical retrieval behaviour,
 * but also reports the query-embedding token cost and the embedder provider so
 * the route can meter it. `retrieveText` itself is left UNCHANGED — the eval
 * runner depends on its exact signature.
 *
 * - real-embeddings path (pgvector, or a real-embeddings bundle) captures
 *   `usage.tokens` via {@link embedQueryRealWithUsage} and reports
 *   `provider: "openai"`.
 * - offline lexical path spends nothing: `embedTokens: 0`, `provider: "lexical"`.
 */
export async function retrieveTextWithUsage(
  query: string,
  k: number = TOP_K,
): Promise<{
  results: Retrieved[];
  embedTokens: number;
  provider: "openai" | "lexical";
}> {
  if (RETRIEVAL_BACKEND === "pgvector") {
    const { vector, tokens } = await embedQueryRealWithUsage(query);
    const { retrievePgvector } = await import("./retrieval-pgvector");
    return {
      results: await retrievePgvector(vector, k),
      embedTokens: tokens,
      provider: "openai",
    };
  }

  if (KB_IS_LEXICAL) {
    return {
      results: rankChunks(KB, lexicalEmbed(query, KB.idf), k),
      embedTokens: 0,
      provider: "lexical",
    };
  }

  const { vector, tokens } = await embedQueryRealWithUsage(query);
  return {
    results: rankChunks(KB, vector, k),
    embedTokens: tokens,
    provider: "openai",
  };
}
