// Provider adapter + embedder seam. This is the ONE place provider specifics live.
//
// Embeddings have two backends, identical shape (512-dim), chosen by env:
//   • real:    OpenAI-compatible `text-embedding-3-small` (dimensions: 512)
//   • offline: a deterministic lexical hashing embedder (no network, no key)
// The SAME function is used at build time (scripts/embed.ts) and at query time,
// so cosine scores are always comparable.

import { createOpenAI } from "@ai-sdk/openai";
import { embedMany, streamText, type LanguageModel } from "ai";
import {
  EMBED_DIMENSIONS,
  EMBED_MODEL,
  CHAT_MODEL,
  USING_REAL_EMBEDDINGS,
  HAS_CHAT_KEY,
} from "./config";

// ---------------------------------------------------------------------------
// Offline deterministic embedder: signed feature-hashing over word tokens,
// L2-normalized. Cosine similarity of two vectors approximates shared-token
// overlap, so lexically related query/chunk pairs score higher — enough to
// exercise retrieval, thresholds, grounding and evals with zero external deps.
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "are",
  "do", "does", "how", "what", "which", "your", "you", "we", "our", "with",
  "that", "this", "it", "as", "at", "by", "be", "can", "i", "my", "me",
]);

function rawTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

export function tokenize(text: string): string[] {
  const raw = rawTokens(text);
  const content = raw.filter((t) => !STOPWORDS.has(t));
  // Keep function words for very short/vague queries so they don't collapse to
  // an all-zero vector (e.g. "what do you do" -> nothing to match).
  return content.length >= 2 ? content : raw;
}

// Default IDF weight for query terms not seen in the corpus (mild, so unknown
// words don't dominate the query vector).
const DEFAULT_IDF = 1;

/** Inverse document frequency over a corpus: distinctive terms weigh more. */
export function computeIdf(texts: string[]): Record<string, number> {
  const df: Record<string, number> = {};
  for (const t of texts) {
    for (const tok of new Set(tokenize(t))) df[tok] = (df[tok] ?? 0) + 1;
  }
  const N = texts.length;
  const idf: Record<string, number> = {};
  for (const tok in df) idf[tok] = Math.log((N + 1) / (df[tok] + 1)) + 1;
  return idf;
}

// FNV-1a 32-bit hash — small, fast, deterministic.
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function lexicalEmbed(
  text: string,
  idf?: Record<string, number>,
): number[] {
  const vec = new Array<number>(EMBED_DIMENSIONS).fill(0);
  for (const tok of tokenize(text)) {
    const h = fnv1a(tok);
    const idx = h % EMBED_DIMENSIONS;
    const sign = (h >>> 16) & 1 ? 1 : -1; // signed hashing reduces collisions
    const weight = idf ? (idf[tok] ?? DEFAULT_IDF) : 1; // IDF: rare terms dominate
    vec[idx] += sign * weight;
  }
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => v / norm);
}

// ---------------------------------------------------------------------------
// Real embeddings provider (OpenAI-compatible).
// ---------------------------------------------------------------------------

function realEmbeddingProvider() {
  return createOpenAI({
    // Embeddings key, falling back to the chat key (same OpenAI-compatible key
    // can serve both), so real embeddings work whenever any key is present.
    apiKey: process.env.EMBEDDINGS_API_KEY || process.env.AI_CHAT_API_KEY,
    baseURL:
      process.env.EMBEDDINGS_BASE_URL ||
      process.env.AI_CHAT_BASE_URL ||
      undefined,
  });
}

/** Embed many texts (build-time and batch use). `idf` weights the lexical path. */
export async function embedBatch(
  texts: string[],
  idf?: Record<string, number>,
): Promise<number[][]> {
  if (!USING_REAL_EMBEDDINGS) return texts.map((t) => lexicalEmbed(t, idf));
  const provider = realEmbeddingProvider();
  const { embeddings } = await embedMany({
    model: provider.embedding(EMBED_MODEL),
    values: texts,
    providerOptions: { openai: { dimensions: EMBED_DIMENSIONS } },
  });
  return embeddings;
}

/** Embed a single query (runtime use). `idf` (from the artifact) weights lexical. */
export async function embedQuery(
  text: string,
  idf?: Record<string, number>,
): Promise<number[]> {
  const [vec] = await embedBatch([text], idf);
  return vec;
}

/**
 * Force a REAL (OpenAI-compatible) query embedding regardless of env flags.
 * Used when the artifact was built with real embeddings, so the query embedder
 * always matches the chunk embedder (never lexical-vs-real mismatch).
 */
export async function embedQueryReal(text: string): Promise<number[]> {
  const provider = realEmbeddingProvider();
  const { embeddings } = await embedMany({
    model: provider.embedding(EMBED_MODEL),
    values: [text],
    providerOptions: { openai: { dimensions: EMBED_DIMENSIONS } },
  });
  return embeddings[0];
}

export function activeEmbeddingModel(): string {
  return USING_REAL_EMBEDDINGS ? EMBED_MODEL : "lexical-hash-512";
}

// ---------------------------------------------------------------------------
// Chat model (genuinely needs a key; callers degrade to a grounded stub when
// absent — see app/api/chat/route.ts).
// ---------------------------------------------------------------------------

export function hasChatModel(): boolean {
  return HAS_CHAT_KEY;
}

export function getChatModel(): LanguageModel | null {
  if (!HAS_CHAT_KEY) return null;
  const provider = createOpenAI({
    apiKey: process.env.AI_CHAT_API_KEY,
    baseURL: process.env.AI_CHAT_BASE_URL || undefined,
  });
  // Use the Chat Completions API (.chat), which is universally OpenAI-compatible
  // (OpenAI, OpenRouter, Together, etc.). The default provider(id) would hit the
  // OpenAI-only Responses API (/v1/responses), which OpenRouter does not serve.
  return provider.chat(CHAT_MODEL);
}

export { streamText };
