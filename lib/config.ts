// Central, right-sized configuration. One knob for the guardrail (threshold).

export const EMBED_MODEL = "text-embedding-3-small";
export const LEXICAL_MODEL = "lexical-hash-512";
export const EMBED_DIMENSIONS = 512;
export const TOP_K = 6;

// Retrieval backend:
//  - "bundle"   (default): in-memory cosine over the build-time data/embeddings.json
//                artifact. Zero infra; the working core. Never loads pg.
//  - "pgvector": Supabase Postgres + pgvector. Requires DATABASE_URL and REAL
//                embeddings (EMBEDDINGS_API_KEY); inert until provisioned + seeded
//                (`pnpm ingest`). Anything other than "pgvector" resolves to bundle.
export const RETRIEVAL_BACKEND: "bundle" | "pgvector" =
  (process.env.RETRIEVAL_BACKEND ?? "").trim().toLowerCase() === "pgvector"
    ? "pgvector"
    : "bundle";

// True when a real OpenAI-compatible embeddings key is present; otherwise the
// deterministic offline lexical embedder is used (build + runtime stay in sync).
export const USING_REAL_EMBEDDINGS = Boolean(process.env.EMBEDDINGS_API_KEY);
export const HAS_CHAT_KEY = Boolean(process.env.AI_CHAT_API_KEY);

// RETRIEVAL_THRESHOLD is the single guardrail knob: below it, retrieval is "too
// weak to ground" and the request escalates instead of guessing. Real OpenAI
// embeddings sit around ~0.35; the offline lexical embedder scales lower, so the
// default is mode-aware. An explicit env var always wins.
// Mode-aware:
//  - real embeddings: 0.35 (semantic scores are well-separated).
//  - lexical + chat model present: 0.05 — let vague-but-legit queries reach the
//    LLM, which grounds/answers legit ones and declines off-topic via its scope
//    rule (lexical scores can't separate "what do you do" from "weather?").
//  - lexical + no chat model (offline eval/demo): 0.20 — reject off-topic
//    deterministically since there is no LLM to arbitrate.
export const RETRIEVAL_THRESHOLD = Number(
  process.env.RETRIEVAL_THRESHOLD ??
    (USING_REAL_EMBEDDINGS ? "0.35" : HAS_CHAT_KEY ? "0.05" : "0.20"),
);

// Chat model id (locked when the key arrives).
export const CHAT_MODEL = process.env.AI_MODEL ?? "gpt-4o-mini";

// Verified contact facts (from research; the only escalation endpoints).
export const CONTACT_EMAIL = "hello@gocadre.ai";
export const CONTACT_URL = "/contact";
export const STRATEGIST_CTA = "Talk to an AI Strategist";
