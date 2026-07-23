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

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
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

export function lexicalEmbed(text: string): number[] {
  const vec = new Array<number>(EMBED_DIMENSIONS).fill(0);
  const tokens = tokenize(text);
  for (const tok of tokens) {
    const h = fnv1a(tok);
    const idx = h % EMBED_DIMENSIONS;
    const sign = (h >>> 16) & 1 ? 1 : -1; // signed hashing reduces collisions
    vec[idx] += sign;
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
    apiKey: process.env.EMBEDDINGS_API_KEY,
    baseURL: process.env.EMBEDDINGS_BASE_URL || undefined,
  });
}

/** Embed many texts (build-time and batch use). */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (!USING_REAL_EMBEDDINGS) return texts.map(lexicalEmbed);
  const provider = realEmbeddingProvider();
  const { embeddings } = await embedMany({
    model: provider.embedding(EMBED_MODEL),
    values: texts,
    providerOptions: { openai: { dimensions: EMBED_DIMENSIONS } },
  });
  return embeddings;
}

/** Embed a single query (runtime use). */
export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await embedBatch([text]);
  return vec;
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
  return provider(CHAT_MODEL);
}

export { streamText };
