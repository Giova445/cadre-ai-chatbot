# Cadre AI Support Chatbot

A customer-support chatbot for **Cadre AI** (an applied-AI consultancy). It is a small, explainable **RAG** system that answers **only** from a bundled knowledge base about Cadre, **refuses to invent** facts it cannot ground (pricing, services, certifications), and **escalates** — book a strategy call, hand off to a human, capture a lead — whenever retrieval is weak or the request is out of scope.

The headline design choice: **it runs fully with zero API keys.** A deterministic lexical embedder backs retrieval and the route returns grounded/escalation text straight from the KB, so the app is demoable and gradeable offline. Adding keys upgrades it in place to real embeddings and a streamed LLM answer — same code path, same guardrails.

> Deep-dive docs: [ARCHITECTURE.md](ARCHITECTURE.md) (design of record) · [SPEC.md](SPEC.md) (frozen contracts) · [DECISIONS.md](DECISIONS.md) (build log) · [TRADEOFFS.md](TRADEOFFS.md) (right-sizing) · [plan.md](plan.md) / [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) (contract + build order).

---

## Quickstart

Package manager is **pnpm**. Node **>= 20**.

```bash
pnpm install

# Generate the RAG artifact once (data/embeddings.json).
# Required before `pnpm dev`, because lib/kb.ts statically imports it.
pnpm embed

pnpm dev          # → http://localhost:3000
```

That is the whole setup. **No keys required** — with nothing configured the app runs in offline mode: the lexical embedder powers retrieval and the chat route returns a grounded stub (the top retrieved chunk, quoted and cited) or a deterministic refusal/escalation. Click a scenario chip or type a question.

### Adding keys (optional upgrade)

Copy `.env.example` to `.env.local` and fill in what you have. Every key is optional and independent.

| Env var | Effect | Read at |
|---|---|---|
| `EMBEDDINGS_API_KEY` | Swaps the offline lexical embedder for real OpenAI-compatible `text-embedding-3-small` (dim 512). **Re-run `pnpm embed`** so the bundled KB is re-embedded with the same embedder used for queries. | build + runtime |
| `AI_CHAT_API_KEY` | Swaps the grounded stub for a **streamed LLM answer** grounded in the retrieved context. | runtime |
| `AI_MODEL` | Chat model id (default `gpt-4o-mini`). | runtime |
| `AI_CHAT_BASE_URL` / `EMBEDDINGS_BASE_URL` | Point at any OpenAI-compatible endpoint (e.g. OpenRouter). | as above |
| `RETRIEVAL_THRESHOLD` | Override the escalate-vs-answer cosine cutoff (see below). | runtime |

> **Invariant:** the KB and the live query must be embedded by the **same** model at the same dimensions, or cosine scores are meaningless. When you add or remove `EMBEDDINGS_API_KEY`, re-run `pnpm embed`.

---

## Offline vs online modes

The mode is chosen per-key at runtime; there is no separate "demo build."

| `EMBEDDINGS_API_KEY` | `AI_CHAT_API_KEY` | Retrieval embedder | Answer path |
|---|---|---|---|
| — | — | `lexical-hash-512` (deterministic, no network) | grounded stub / deterministic refusal + escalation |
| set | — | `text-embedding-3-small` (dim 512) | grounded stub (still no generative model) |
| — | set | `lexical-hash-512` | **streamed LLM answer**, grounded in retrieved context |
| set | set | `text-embedding-3-small` | **streamed LLM answer**, grounded in retrieved context |

**Why this exists.** Retrieval, thresholds, guardrails, escalation, and the eval harness all exercise the same pipeline regardless of keys. Cosine scores stay comparable because *the same embedder runs at build time and query time*. The lexical embedder is signed feature-hashing over word tokens (FNV-1a → 512-dim, L2-normalized): cosine similarity approximates shared-token overlap, which is enough to rank a few-dozen-chunk KB (8 docs → 36 chunks). It is **lexical, not semantic** — that trade-off, and the lower calibrated threshold it needs, are covered in [TRADEOFFS.md](TRADEOFFS.md).

The guardrails never depend on the LLM. Pricing questions, explicit human requests, weak retrieval, and **unsupported claims** are decided by a **deterministic function** (`lib/guardrail.ts` → `decide()`) before any model is called, so refusals and escalations behave identically in every mode. The unsupported check is a **grounding-coverage guard**: even when a query clears the retrieval threshold, if its distinctive terms are not actually present in the retrieved chunk text (coverage < 0.4), the bot refuses rather than confirm. This is what makes "Do you offer a 24/7 managed AI hosting plan?" refuse — retrieval alone scored it almost identically to a real-service question (~0.279 vs ~0.281), so cosine could not separate them; the coverage guard does. It works with real embeddings too.

---

## Architecture at a glance

One Next.js (App Router) app, one Vercel deploy. No separate backend, no database in Tier 0.

```
Chat UI → POST /api/chat → embedQuery(query) → cosine top-k over bundled vectors
        → guardrail decide()  ── refuse / escalate → deterministic text
                              │   (pricing · human · weak retrieval · unsupported)
                              └─ answer → streamText (LLM) or grounded stub
        → plain-text stream (+ x-cadre-* metadata headers)
```

| Module | Job |
|---|---|
| `content/*.md` | Human-authored knowledge base (one topic per file, `title`/`tags` frontmatter). |
| `scripts/embed.ts` | Build-time ingest: chunk by heading → embed → write `data/embeddings.json`. |
| `data/embeddings.json` | Generated, read-only RAG artifact (chunk text + vector + metadata). Never hand-edit. |
| `lib/chunk.ts` | Markdown chunker (by heading, ~300–500 tokens, ~15% overlap, never splits tables/code). |
| `lib/retrieval.ts` | Pure cosine similarity + top-k + weak-retrieval test. No I/O. |
| `lib/kb.ts` | Binds the generated artifact to the pure retrieval core. |
| `lib/llm.ts` | The one provider seam: offline lexical embedder, real embeddings, and the chat model factory. |
| `lib/guardrail.ts` | Deterministic `decide()` — pricing → refuse, human → escalate, weak → escalate, unsupported (grounding-coverage < 0.4) → refuse, else answer. |
| `lib/prompt.ts` | Persona + grounding + escalation system prompt; builds the model message array. |
| `lib/responses.ts` | On-brand deterministic copy for refusal/escalation/grounded-stub paths. |
| `lib/config.ts` | Central config; `RETRIEVAL_THRESHOLD` is the single guardrail knob. |
| `app/api/chat/route.ts` | The orchestrator + custom plain-text streaming endpoint. |
| `app/page.tsx` | Chat UI: streaming transcript, scenario chips, escalation CTA. |
| `app/contact/page.tsx` | Tier-0 lead capture (no backend; points to `hello@gocadre.ai`). |

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full C4 view, data-flow diagrams, failure modes, and security posture, and [SPEC.md](SPEC.md) for the frozen interface contracts.

---

## Evals and tests

The bot is built **eval-first**: "correct" is defined before features. The golden set (`evals/golden.json`) is 9 cases — 6 core support scenarios (all `grounded`) plus 3 adversarial cases (`adv-pricing` → refuse, `adv-offtopic` → escalate, `adv-hallucination` → refuse) — with per-case `expect` (`grounded` / `refuse` / `escalate`), `mustCite`, and `mustNotSay` assertions (contract typed in `lib/types.ts` as `GoldenCase`; full table in [SPEC.md](SPEC.md)).

```bash
pnpm eval         # run the golden set through the decision pipeline → 9/9 PASS
pnpm test         # Vitest over the pure cores → 20/20 pass
pnpm typecheck    # tsc --noEmit → clean
```

The eval runner (`evals/run.ts`) reproduces the real request path — embed the question, retrieve top-k, run the same deterministic `decide()` the route uses, materialize the exact user-facing text — and asserts it against each case, without spending a token. Unit tests target the pure, I/O-free modules (`lib/retrieval.ts`, `lib/chunk.ts`, `lib/guardrail.ts`, and the lexical embedder in `lib/llm.ts`), which need no artifact or key.

---

## Verification

The final build is green end to end:

| Check | Result |
|---|---|
| `pnpm typecheck` | clean (`tsc --noEmit`) |
| `pnpm test` | **20/20 pass** (retrieval, embedder, guardrail, chunk) |
| `pnpm eval` | **9/9 PASS** — 6 core grounded + cited, `adv-pricing` refuses with no figure, `adv-offtopic` escalates, `adv-hallucination` refuses (coverage guard) |
| `next build` | succeeds — 5 routes; `/` and `/contact` prerendered static, `/api/chat` dynamic (Node runtime) |
| RAG artifact | `data/embeddings.json` generated: 8 docs → **36 chunks**, dim 512 |
| Live smoke test | grounded answer streams with its source header; a pricing question refuses with no dollar figure; an off-topic question escalates |

The committed artifact is built by the offline lexical embedder (`model: "lexical-hash-512"`), so the repo clones and runs green with no keys. Supplying `EMBEDDINGS_API_KEY` and re-running `pnpm embed` swaps in real `text-embedding-3-small` vectors.

## Deploy to Vercel

1. Import the repo into Vercel. Framework preset: **Next.js**. Build command: `pnpm build`.
2. `pnpm build` runs `prebuild` (`tsx scripts/embed.ts`) first, which regenerates `data/embeddings.json`, then `next build`. The artifact is produced during the build and bundled into the deployment (read-only at runtime — the ephemeral serverless filesystem is never written).
3. **With no env vars set, the deploy still works** in offline mode — a fully functional demo. To enable real embeddings and streamed answers, add `EMBEDDINGS_API_KEY` and/or `AI_CHAT_API_KEY` (plus optional `AI_MODEL`, base URLs) as Vercel project env vars. The embeddings key is used at build (to embed the KB) and at runtime (to embed the query); the chat key is runtime-only.
4. The `/api/chat` route pins the Node runtime (`export const runtime = "nodejs"`).

---

## Why this stack — and what was rejected

**Chosen:** Next.js (App Router) + Vercel AI SDK v7 on Vercel; `@ai-sdk/openai` as an OpenAI-compatible client; `zod` for boundary validation; `gray-matter` for frontmatter; `tsx`/`vitest` for scripts and tests. One app, one deploy, first-class streaming.

**RAG without a vector DB.** At ~8–10 docs (a few dozen chunks) an in-memory brute-force cosine scan is **sub-millisecond and exact (100% recall)**. An approximate-nearest-neighbor index exists to avoid scanning *millions* of vectors — a problem this corpus does not have.

| Rejected | Why not (and when it flips) |
|---|---|
| **pgvector / Supabase** | A managed Postgres + vector extension to hold a few dozen vectors is infrastructure with no payoff. Reconsider past ~200–500 chunks. |
| **Local vector DBs** (Chroma, LanceDB, FAISS-on-disk) | Serverless has an **ephemeral filesystem** — no durable local disk to host an index — and there is nothing to gain over an in-memory scan of a tiny corpus. |
| **Hosted vector DB** (Pinecone, etc.) | External SaaS + cost + network latency for a corpus that fits in memory. |
| **Cross-session memory / auth / multi-tenant / RBAC** | This is a public support bot, not a portal. Each adds a store and a privacy surface for no Tier 0 requirement. |
| **AI-Maturity-Index scoring engine** | The KB *describes* the 8-pillar framework; computing scores is a separate product, not a support feature. |

The provider is kept swappable behind `lib/llm.ts`, mirroring Cadre's own model-agnostic stance.

---

## Scale thresholds — when I would change the design

Naming the triggers proves the simplicity is a decision, not a limitation.

| Signal | Rough threshold | What I would add |
|---|---|---|
| KB size | Beyond ~200–500 chunks, or the artifact exceeds a few MB | Move embeddings out of the bundle; add an ANN index (hosted pgvector / managed vector DB). |
| Query volume | Sustained concurrency where per-request scan shows up in latency | Cache the loaded index across warm invocations; add rate limiting. |
| Persistence / analytics | Need durable conversation history, not spot-check logs | Promote Tier 1 Upstash logging to a real datastore with retention + querying. |
| Multi-tenant / auth | More than one audience, or gated content | Add auth (Auth.js/Clerk) + per-tenant KB partitioning. |
| KB freshness | Must update without a redeploy | Add a runtime ingestion path + a real store (give up the read-only bundled artifact). |
| Answer quality at scale | Retrieval precision drops as the corpus grows | Add reranking, hybrid keyword+vector search, and metadata filtering on the `tags` already stored. |

---

## Declared cuts and what's next

**Shipped (Tier 0):** streaming chat + scenario chips, RAG-grounded answers, deterministic guardrails, three escalation paths, offline-first operation, eval-first golden set, deployed URL.

**Cut for now (Tier 1, cleanly declared):** the ultra-thin read-only admin backed by Upstash Redis — recent conversations, escalations/leads, retrieval trace (which chunks + scores), and the KB-gap view — plus its conversation logging. A clean Tier 0 with an honest cut beats a broken stretch. The route already has the seam for it: guardrail metadata is emitted on every response via `x-cadre-*` headers.

**Also out (per plan):** real end-user portal/auth, live booking/Calendly API, maturity-index scoring engine, fine-tuning, multi-tenant, cross-session memory, a vector DB of any kind.

**What I'd do next:** wire the Tier 1 Upstash logging + admin off the existing header metadata; expand the KB and supply real embedding + chat keys; add reranking / hybrid search and rate limiting as the corpus and traffic grow.
