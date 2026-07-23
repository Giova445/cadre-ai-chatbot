// Central, right-sized configuration. One knob for the guardrail (threshold).

export const EMBED_MODEL = "text-embedding-3-small";
export const LEXICAL_MODEL = "lexical-hash-512";
export const EMBED_DIMENSIONS = 512;
export const TOP_K = 4;

// True when a real OpenAI-compatible embeddings key is present; otherwise the
// deterministic offline lexical embedder is used (build + runtime stay in sync).
export const USING_REAL_EMBEDDINGS = Boolean(process.env.EMBEDDINGS_API_KEY);
export const HAS_CHAT_KEY = Boolean(process.env.AI_CHAT_API_KEY);

// RETRIEVAL_THRESHOLD is the single guardrail knob: below it, retrieval is "too
// weak to ground" and the request escalates instead of guessing. Real OpenAI
// embeddings sit around ~0.35; the offline lexical embedder scales lower, so the
// default is mode-aware. An explicit env var always wins.
export const RETRIEVAL_THRESHOLD = Number(
  process.env.RETRIEVAL_THRESHOLD ?? (USING_REAL_EMBEDDINGS ? "0.35" : "0.08"),
);

// Chat model id (locked when the key arrives).
export const CHAT_MODEL = process.env.AI_MODEL ?? "gpt-4o-mini";

// Verified contact facts (from research; the only escalation endpoints).
export const CONTACT_EMAIL = "hello@gocadre.ai";
export const CONTACT_URL = "/contact";
export const STRATEGIST_CTA = "Talk to an AI Strategist";
