# TRADEOFFS.md — right-sizing the build

Every component here was chosen to be **as simple as the problem allows, and no simpler**. Cadre explicitly flags "custom build when a simple thing works," so this document states, for each major decision: what was chosen, what it costs, what the rejected alternative would have bought, and the concrete signal at which the trade-off flips. Depth lives in the retrieval math and the guardrails — not in infrastructure.

---

## 1. Brute-force cosine vs. a vector database

**Chosen:** load `data/embeddings.json` into memory and compute cosine similarity against every chunk on each query (`lib/retrieval.ts`).

At ~8–10 documents (a few dozen chunks of 512-dim vectors) a full linear scan is **sub-millisecond and exact — 100% recall**. End-to-end latency is dominated by the LLM stream, not by retrieval.

| | Brute-force cosine (chosen) | Vector DB (pgvector / Pinecone / local FAISS·Chroma·LanceDB) |
|---|---|---|
| Setup | none — a JSON import | managed service or a local index build |
| Latency @ ~dozens of chunks | sub-ms | ms + network, or index load on cold start |
| Recall | exact (100%) | approximate (ANN trades recall for speed) |
| Ops / cost | zero standing infra | a service to run, or a file an ephemeral FS can't keep |
| Serverless fit | perfect (read-only bundled artifact) | local DBs conflict with the ephemeral filesystem |

**What a vector DB would buy, and when it's worth it:** ANN indexes exist to avoid scanning *millions* of vectors. That is not this corpus. The trade **flips past ~200–500 chunks or when the artifact grows beyond a few MB** — at which point brute force stops being obviously free and I would move embeddings out of the bundle and add a hosted index (starting with pgvector). Not before. Hosted vector DBs (Pinecone) add external SaaS + cost + network latency for a corpus that fits in memory; local vector DBs (FAISS-on-disk, Chroma, LanceDB) have no durable disk to live on in serverless and gain nothing over an in-memory scan of a tiny corpus.

---

## 2. Offline lexical embedder vs. requiring a real embeddings key

**Chosen:** default to a deterministic lexical embedder (`lexicalEmbed` in `lib/llm.ts`) — signed FNV-1a feature-hashing over word tokens into a 512-dim L2-normalized vector — and upgrade to real `text-embedding-3-small` only when `EMBEDDINGS_API_KEY` is set. The **same** embedder runs at build time and query time, so cosine scores stay comparable.

**Pros**

- **Zero-key operation.** The app installs, embeds, runs, and is gradeable with no credentials — the reviewer needs nothing but `pnpm`.
- **Determinism.** Same input → same vector, every run. Evals and unit tests are reproducible without network flakiness or token spend.
- **Full-pipeline fidelity.** Retrieval, the threshold, the guardrails, and the escalation paths exercise the identical code path offline and online. Nothing is stubbed except the semantic quality of the vectors.

**Cons (and the mitigations)**

- **Lexical, not semantic.** It rewards shared tokens, not meaning — synonyms and paraphrases score lower than a real embedding would. Mitigation: the KB is small and its headings are on-topic, and the golden questions use vocabulary close to the docs. This is a demo-quality retriever, not a production one.
- **Different score scale → needs calibration.** Lexical cosine sits lower than OpenAI cosine, so `RETRIEVAL_THRESHOLD` defaults to **~0.08 offline vs ~0.35 with real embeddings** (mode-aware in `lib/config.ts`, env-overridable, and echoed into the artifact as `thresholdHint`).
- **Swap cost is one env var + a re-embed.** Set `EMBEDDINGS_API_KEY`, re-run `pnpm embed`, and the corpus + queries move to real embeddings with no code change.

**When the trade flips:** the moment answer quality matters more than zero-setup — i.e., a real demo with keys, or production — supply the embeddings key. The lexical embedder is a fallback and a test harness, never the intended production retriever.

---

## 3. No persistence in Tier 0

**Chosen:** store nothing. No database, no conversation log, no cross-session memory.

**Pros:** zero standing infra and cost; no privacy surface to secure; nothing to write on an ephemeral serverless filesystem; the RAG artifact is the only state and it is read-only.

**Cons:** no analytics, no durable history, no way to see what users asked after the fact — exactly what the Tier 1 admin would provide.

**When it's worth adding:** when the product needs to *learn from usage* — a retrieval trace to audit answers, an escalations/leads list, a KB-gap view of below-threshold questions. That is the deferred **Tier 1**: a single fire-and-forget log call in the route into **Upstash Redis** (serverless HTTP, no connection-pool problem), read by an ultra-thin read-only admin. The route already emits everything that layer needs on `x-cadre-*` headers, so adding it is additive, not a refactor. A logging write must never break a chat response. Beyond spot-check logging — durable history with retention and querying — promote it to a real datastore.

---

## 4. Provider-agnostic seam vs. hardwiring one vendor

**Chosen:** all provider specifics live in `lib/llm.ts` behind an OpenAI-compatible client; the chat model id is config (`AI_MODEL`), and chat and embeddings providers may differ (each has its own key and optional base URL).

**Pros:** the exact provider/model is locked when a key arrives; swapping OpenAI ↔ OpenRouter ↔ any compatible endpoint touches one file and no call sites. It mirrors Cadre's own model-agnostic stance, and it decouples the (possibly Anthropic-only) chat key from the embeddings key — if the chat provider can't embed, a cheap OpenAI key covers `text-embedding-3-small` for pennies.

**Cons:** targeting the lowest-common-denominator OpenAI-compatible API means provider-specific features (bespoke tool formats, vendor-only params) aren't used. At this scope that costs nothing.

**When it flips:** if a specific provider's unique capability becomes worth the lock-in, specialize behind the same seam.

---

## 5. Custom plain-text streaming protocol vs. the AI SDK UI protocol

**Chosen:** `/api/chat` streams raw text and puts guardrail metadata in `x-cadre-*` response headers, instead of emitting the Vercel AI SDK's UI-message data-stream protocol.

**Pros:** the four response paths — streamed LLM answer, offline grounded stub, deterministic refusal, deterministic escalation — all look identical to the client, so one ~20-line reader in the UI handles every mode. Two of those paths never call a model, which the UI protocol assumes is always present. Metadata (mode, reason, cited sources, top score) rides alongside without inventing a message envelope.

**Cons:** a little client code is written by hand instead of using `useChat`, and there's no built-in plumbing for tool calls or rich UI-message parts.

**When it flips:** if the bot grows tool calls, multi-part messages, or other first-class AI SDK UI features, adopt the SDK's protocol then. For a single grounded-text stream, the custom protocol is simpler and strictly more uniform.

---

## 6. Deterministic guardrail vs. trusting the model to police itself

**Chosen:** a pure `decide()` (`lib/guardrail.ts`) routes pricing → refuse, explicit-human → escalate, weak/empty retrieval → escalate, else answer — **before** any model call, and it is the same function the eval runner asserts against.

**Pros:** Layer 1 guardrails can't be prompt-injected around (the model is never asked to enforce "don't quote pricing"); the decision is testable without spending a token; and the evals validate the exact logic that runs in production. The grounding system prompt (`lib/prompt.ts`) is Layer 2, defense-in-depth, and treats retrieved text as data, not instructions.

**Cons:** regex intent detection is coarse — it can misjudge an oddly phrased pricing or human-handoff request. Mitigation: the retrieval threshold backstops unknown/off-topic questions regardless of phrasing, and Layer 2 catches what Layer 1 misses. A production version would replace the regex with a small intent classifier behind the same interface.

**When it flips:** when intent detection needs to be robust across paraphrase and adversarial phrasing, swap the regex for a classifier — the `decide()` signature stays, so the route and evals don't change.

---

## The through-line

Each choice buys **simplicity, zero-setup operation, and testability** now, and names the exact signal at which paying for more (a vector DB, real embeddings, persistence, provider-specific features, a richer protocol, a real intent classifier) becomes worth it. Right-sizing is a decision here, documented with its own reversal conditions — not a limitation.
