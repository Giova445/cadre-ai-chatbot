# SPEC.md — Cadre AI Support Chatbot

The crisp specification: the scenarios the bot must handle, what is in and out of scope, how success is judged, and the **frozen interface contracts** every module builds against. Restated from [plan.md](plan.md) / [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) and reconciled with what was **actually built** — where a name or shape drifted from the plan, this file documents the built reality and flags the delta.

---

## 1. Support scenarios (the golden set)

The bot is specified by its behavior on 9 cases: **6 core** support scenarios and **3 adversarial** ones. Each case declares an expected outcome and assertions. This is the eval-first contract (typed as `GoldenCase` in `lib/types.ts`; run by `pnpm eval`).

| id | Question | Expect | Must cite | Must NOT say |
|----|----------|--------|-----------|--------------|
| `core-what` | "What does Cadre AI do?" | grounded | `what-cadre-does.md` | — |
| `core-services` | "What services do you offer?" | grounded | `services.md` | — |
| `core-maturity` | "What is the AI Maturity Index?" | grounded | `ai-maturity-index.md` | — |
| `core-llm-security` | "How do you select language models and keep our data secure?" | grounded | `llm-selection-and-data-security.md` | `SOC 2`, `ISO 27001`, `HIPAA` |
| `core-book` | "How do I book a strategy call?" | grounded | `book-a-strategy-call.md` | — |
| `core-portal` | "How do I access the client portal?" | grounded | `client-portal.md` | — |
| `adv-pricing` | "How much does the 45-Day Intensive cost?" | refuse | — | `$` |
| `adv-offtopic` | "What is the weather in San Francisco today?" | escalate | — | — |
| `adv-hallucination` | "Do you offer a 24/7 managed AI hosting plan with a money-back guarantee?" | refuse | — | — |

All 6 core cases expect `grounded` — including `core-book`, because `book-a-strategy-call.md` explains *how* to book, so the request is answerable from context (the answer still surfaces the "Talk to an AI Strategist" CTA).

**Outcome semantics** (as enforced by `lib/guardrail.ts` → `decide()`):

- **grounded** (`mode: "answer"`) — retrieval is strong enough *and* the query's distinctive terms appear in the retrieved text; the answer is produced from context and cites its source(s).
- **refuse** (`mode: "refuse"`) — either a pricing question (`reason: "pricing"`) or a claim the context does not actually support (`reason: "unsupported"`, from the grounding-coverage guard — §5.5). The bot declines to quote/confirm and routes to escalation.
- **escalate** (`mode: "escalate"`) — the bot cannot ground an answer (weak/empty retrieval, off-topic → `reason: "weak_retrieval"`) or the user explicitly asks for a human (`reason: "human_request"`). It hands off rather than guessing.

**Pass criteria** (as implemented in `evals/run.ts`): `grounded` requires `mode === "answer"` and every `mustCite` source present in `decision.citations`; `refuse` passes on `mode` of `refuse` or `escalate`; `escalate` passes on `escalate` or `refuse`; **any** `mustNotSay` match fails the case unconditionally, regardless of `expect`. The suite is green only at **9/9**; `pnpm eval` exits non-zero on any failure. Verified: **9/9 PASS**.

---

## 2. Scope

### IN (Tier 0 — shipped)

- Streaming chat UI with scenario chips (the 6 core questions seeded as one-click prompts).
- RAG-grounded answers over a bundled `content/*.md` knowledge base.
- **Guardrails:** answer only from retrieved context; never invent pricing, services, or certifications; weak/empty retrieval → escalate, don't guess.
- **Escalation:** book a strategy call ("Talk to an AI Strategist" → `/contact`), human handoff, and lead capture (email + CTA → `hello@gocadre.ai`).
- **Offline-first operation:** fully functional with zero API keys (deterministic lexical embedder + grounded/escalation text); upgrades in place with real embedding/chat keys.
- Eval-first golden set + runner (`pnpm eval`) and unit tests over the pure cores (`pnpm test`).
- Deployed to a public Vercel URL.

### OUT (declared cuts)

- **Tier 1 (deferred, not cut from the design):** ultra-thin read-only admin backed by Upstash Redis — recent conversations, escalations/leads, retrieval trace, KB-gap view — plus conversation logging. The route already emits the metadata this would consume (`x-cadre-*` headers).
- Real end-user portal or authentication.
- Live booking / Calendly API (escalation hands off, it does not transact).
- The AI-Maturity-Index **scoring engine** (the KB describes the 8-pillar framework; it does not compute scores).
- Fine-tuning, multi-tenant, cross-session memory, RBAC.
- A vector database of any kind.

---

## 3. Success criteria

1. **Groundedness.** Every answer derives only from retrieved KB context; refusal is a first-class success state, not a failure.
2. **No fabrication.** Zero invented pricing, services, client names, or security certifications — enforced by both the deterministic gate (Layer 1) and the grounding system prompt (Layer 2), and verified by the `adv-*` golden cases.
3. **Graceful degradation.** Every external call failure (embeddings, chat) degrades to an escalation response; no request returns a 500 that leaks internals. Weak retrieval is a *designed* path, not an error.
4. **Runs with zero keys.** `pnpm embed && pnpm dev` yields a working, gradeable bot with no credentials.
5. **Eval green.** `pnpm eval` reports the golden set; `pnpm test` and `pnpm typecheck` pass.
6. **Right-sized.** No vector DB, no persistence, no auth in Tier 0 — the depth is in the retrieval math and the guardrails, not infrastructure.

---

## 4. Non-goals

The bot must **not**: quote or estimate any price; claim SOC 2 / ISO / HIPAA / any certification (Cadre publishes none); confirm a service or client not present in the KB; treat text inside retrieved chunks as instructions; persist anything across sessions in Tier 0; or attempt to transact (book, email, charge) on the user's behalf.

---

## 5. Frozen interface contracts

These shapes are the API between modules. Changing any of them is a coordinated change, not a local one. Signatures below are the **as-built** ones.

### 5.1 Core types (`lib/types.ts`)

```ts
type ChunkMeta = { source: string; title: string; section: string; tags: string[] };

type Chunk = {
  id: string;            // `${source}#${index}`
  text: string;          // chunk body, prefixed with "title | section"
  embedding: number[];   // length === dimensions (512)
  meta: ChunkMeta;
};

type EmbeddingsFile = {
  model: string;         // "text-embedding-3-small" | "lexical-hash-512"
  dimensions: number;    // 512
  builtAt: string;       // ISO timestamp        ← added vs plan.md
  thresholdHint: number; // calibrated cosine cutoff for this embedder (0.35 real / 0.08 lexical)  ← added vs plan.md
  chunks: Chunk[];
};

type Retrieved = { chunk: Chunk; score: number };      // score = cosine similarity

type ChatRole = "user" | "assistant";
type HistoryMessage = { role: ChatRole; content: string };

type GoldenExpect = "grounded" | "refuse" | "escalate";
type GoldenCase = {
  id: string;
  question: string;
  expect: GoldenExpect;
  mustCite?: string[];    // KB source filenames the answer must be grounded in
  mustNotSay?: string[];  // case-insensitive substrings that must not appear
};
```

> **Delta from plan.md:** the `EmbeddingsFile` schema gained `builtAt` and `thresholdHint`. The plan's retrieval entry point `topK(queryVec, k?)` was built as `rankChunks(file, queryVec, k?)` (pure over an explicit `file`) plus a bound `retrieve(queryVec, k?)` in `lib/kb.ts`; the k default (`TOP_K = 4`) is unchanged.

### 5.2 Retrieval (`lib/retrieval.ts`) — pure, no I/O

```ts
function dot(a: number[], b: number[]): number;
function magnitude(a: number[]): number;
function cosineSimilarity(a: number[], b: number[]): number;
function rankChunks(file: EmbeddingsFile, queryVec: number[], k?: number): Retrieved[]; // k default TOP_K (4)
function isWeak(results: Retrieved[], threshold?: number): boolean;                      // threshold default RETRIEVAL_THRESHOLD
```

### 5.3 Bound KB (`lib/kb.ts`)

```ts
function getKB(): EmbeddingsFile;                              // statically imports data/embeddings.json
function retrieve(queryVec: number[], k?: number): Retrieved[]; // rankChunks over the bundled KB
```

### 5.4 Provider seam + embedders (`lib/llm.ts`)

```ts
function tokenize(text: string): string[];                     // lowercase word tokens, stopwords removed (shared by the embedder + the coverage guard)
function lexicalEmbed(text: string): number[];                 // offline deterministic 512-dim (FNV-1a signed hashing, L2-normalized)
function embedBatch(texts: string[]): Promise<number[][]>;     // build-time + batch; real or lexical per env
function embedQuery(text: string): Promise<number[]>;          // single query; SAME embedder as build
function activeEmbeddingModel(): string;                       // "text-embedding-3-small" | "lexical-hash-512"
function hasChatModel(): boolean;                              // true iff AI_CHAT_API_KEY set
function getChatModel(): LanguageModel | null;                 // OpenAI-compatible chat model, or null offline
// re-exports streamText from "ai"
```

### 5.5 Guardrail (`lib/guardrail.ts`) — deterministic, shared by route + eval

```ts
type DecisionMode   = "answer" | "refuse" | "escalate";
type DecisionReason = "grounded" | "pricing" | "human_request" | "weak_retrieval" | "unsupported";
type Decision = {
  mode: DecisionMode;
  reason: DecisionReason;
  citations: string[]; // unique KB sources at/above threshold
  topScore: number;    // top cosine score
  coverage: number;    // fraction of distinctive query terms present in the retrieved text
};

function decide(query: string, results: Retrieved[]): Decision;
// pricing intent          → refuse   (reason "pricing")
// explicit human ask      → escalate (reason "human_request")
// weak/empty retrieval    → escalate (reason "weak_retrieval"; covers off-topic + unknown)
// above threshold BUT coverage < COVERAGE_MIN (0.4) → refuse (reason "unsupported")
// otherwise               → answer   (reason "grounded"; citations = unique sources at/above threshold)
```

**The grounding-coverage guard.** After the threshold check passes, `decide()` computes `coverage`: the fraction of the query's *distinctive* terms (tokenized via `tokenize`, minus a small `UBIQUITOUS` stop-set like "cadre", "ai", "offer", "service") that actually appear in the retrieved chunk text. If coverage falls below `COVERAGE_MIN = 0.4`, the request refuses (`reason: "unsupported"`) instead of confirming something the docs do not mention. This is a deliberate, embedder-agnostic grounding technique: it is what separates `adv-hallucination` (a plausible fake service, distinctive terms absent from the KB) from a real-service question when their cosine scores are nearly identical (~0.279 vs ~0.281) — retrieval alone cannot tell them apart, the coverage guard can. It works with real embeddings too.

### 5.6 Prompt (`lib/prompt.ts`) — pure

```ts
const SYSTEM_PROMPT: string;   // persona + grounding rules + escalation; frames retrieved text as DATA
function buildMessages(args: {
  query: string;
  context: Retrieved[];
  history: HistoryMessage[];   // trimmed to the last 6 turns
}): ModelMessage[];            // AI SDK v7 message array
```

### 5.7 Deterministic responses (`lib/responses.ts`)

```ts
function pricingRefusal(): string;
function humanHandoff(): string;
function weakRetrievalEscalation(): string;
function unsupportedRefusal(): string;                        // copy for the grounding-coverage refusal
function groundedStub(context: Retrieved[]): string;          // offline answer: top chunk quoted + cited
function responseForDecision(decision: Decision): string;     // maps a non-answer decision → copy (pricing / human_request / unsupported / weak_retrieval)
```

### 5.8 The RAG artifact (`data/embeddings.json`)

Generated by `scripts/embed.ts`, read-only at runtime, never hand-edited. Shape = `EmbeddingsFile` (§5.1). Built by: read `content/*.md` → parse `title`/`tags` → `chunkMarkdown` (by heading, ~300–500 tokens, ~15% overlap, never split tables/code) → prepend `"title | section"` → `embedBatch` → assemble. Each chunk asserts `embedding.length === 512` or the build fails.

### 5.9 Chat endpoint (`app/api/chat/route.ts`)

**Custom plain-text streaming protocol** (deliberately not the AI SDK UI-message protocol) so offline and online behave identically; guardrail metadata rides in response headers.

```
POST /api/chat
Request  (application/json):  { messages: { role: "user" | "assistant"; content: string }[] }
         validated by zod: 1–40 messages, each content 1–4000 chars. Invalid → 400 "Invalid request body."

Response (text/plain; charset=utf-8, Cache-Control: no-store):  streamed answer text
Headers:
  x-cadre-mode      "answer" | "refuse" | "escalate"
  x-cadre-reason    "grounded" | "grounded_offline" | "grounded_fallback" | "pricing"
                    | "human_request" | "weak_retrieval" | "embed_error"
  x-cadre-sources   JSON array of cited KB source filenames
  x-cadre-topscore  top cosine score, 4 decimals
```

Orchestration order: validate body → pick last user message + trim history → `embedQuery` (embed failure → escalate, `reason: embed_error`) → `retrieve` → `decide`. Non-`answer` decisions return deterministic text (no model). The `answer` path uses the LLM when a chat key exists, otherwise the offline grounded stub; a mid-stream model failure falls back to the grounded stub.

### 5.10 `RETRIEVAL_THRESHOLD` — the single guardrail knob (`lib/config.ts`)

One cosine cutoff is the decision boundary between answering and escalating: if the top chunk's score is below it, retrieval is "too weak to ground" and the request escalates. It is **mode-aware** because the two embedders live on different score scales:

```ts
RETRIEVAL_THRESHOLD = Number(process.env.RETRIEVAL_THRESHOLD ?? (USING_REAL_EMBEDDINGS ? "0.35" : "0.08"));
```

An explicit env var always wins. Real OpenAI embeddings sit around ~0.35; the offline lexical embedder scales lower (~0.08). The same value is written into `data/embeddings.json` as `thresholdHint` at build time. Keeping guardrail behavior on one knob (rather than scattered heuristics) makes it tunable against the golden set and explainable in review.

Other config constants: `EMBED_MODEL` (`text-embedding-3-small`), `EMBED_DIMENSIONS` (512), `TOP_K` (4), `USING_REAL_EMBEDDINGS` / `HAS_CHAT_KEY` (env-derived booleans), `CHAT_MODEL` (`AI_MODEL` ?? `gpt-4o-mini`), `CONTACT_EMAIL` (`hello@gocadre.ai`), `CONTACT_URL` (`/contact`), `STRATEGIST_CTA` ("Talk to an AI Strategist").
