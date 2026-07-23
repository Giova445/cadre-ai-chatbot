// Per-token pricing for the EXACT models in use. Confirmed live (scripts/probe-usage.ts):
// active provider is OpenAI direct (sk-proj- key, base unset); chat = gpt-4o-mini,
// embed = text-embedding-3-small. OpenAI exposes NO pricing API (verified: no
// endpoint returns rates), so this is a DATED, manually-maintained table of OpenAI's
// published list prices — not a placeholder. Update `asOf` when rates change.
//
// Provider-aware: OpenAI direct → this table. If AI_CHAT_BASE_URL/EMBEDDINGS_BASE_URL
// point at OpenRouter, the response carries usage.cost (authoritative) and cost.ts
// prefers it; this table is then only the fallback.

export type Rate = {
  inputPerMTokUsd: number; // USD per 1M input tokens
  outputPerMTokUsd: number; // USD per 1M output tokens (0 for embeddings)
  cachedInputPerMTokUsd: number; // discounted cached-input reads
  source: string;
  asOf: string;
};

const SRC = "openai.com/api/pricing";
const AS_OF = "2026-07-23";

// The two models actually in use (confirmed), plus a small set we might switch to.
export const RATES: Record<string, Rate> = {
  "gpt-4o-mini": { inputPerMTokUsd: 0.15, outputPerMTokUsd: 0.6, cachedInputPerMTokUsd: 0.075, source: SRC, asOf: AS_OF },
  "text-embedding-3-small": { inputPerMTokUsd: 0.02, outputPerMTokUsd: 0, cachedInputPerMTokUsd: 0.02, source: SRC, asOf: AS_OF },
  "text-embedding-3-large": { inputPerMTokUsd: 0.13, outputPerMTokUsd: 0, cachedInputPerMTokUsd: 0.13, source: SRC, asOf: AS_OF },
  "gpt-4o": { inputPerMTokUsd: 2.5, outputPerMTokUsd: 10, cachedInputPerMTokUsd: 1.25, source: SRC, asOf: AS_OF },
  "gpt-4.1-mini": { inputPerMTokUsd: 0.4, outputPerMTokUsd: 1.6, cachedInputPerMTokUsd: 0.1, source: SRC, asOf: AS_OF },
};

/** Rate for a model id, tolerant of an "openai/" OpenRouter prefix. Null if unknown. */
export function rateFor(model: string): Rate | null {
  const bare = model.replace(/^openai\//, "");
  return RATES[bare] ?? null;
}
