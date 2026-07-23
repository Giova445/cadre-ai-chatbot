# Cadre AI Take-Home — Support Chatbot (Build Plan v2)

## Context
Stage 3 of Cadre AI's Forward-Deployed-AI-Engineer loop: build a **customer-support chatbot for Cadre AI**, deployed to a public URL, in a **fresh GitHub repo**, with `CLAUDE.md` + `plan.md` at root, built primarily with **Claude Code**. Graded: **Claude Code 30%**, Architecture 25%, Speed/Scope 20%, Code Quality 15%, Communication 10%. Then a 1-hour live review (demo → architecture → Claude Code workflow → code deep-dive → trade-offs).

**Strategy:** prior feedback = "not the most applied-AI experience, but understands what he knows + self-motivated." Erase it with a **clean, explainable RAG system + a rigorous, systematic engineering process**, on **right-sized tech** (no over-engineering — Cadre explicitly flags "custom build when a simple thing works"). Depth comes from **process rigor + owning the retrieval math**, not from infra.

**Rules:** fresh repo (not the portfolio repo). Giovanny drives Claude Code; must defend every line live. Deploy day 1. Keep `DECISIONS.md` (Claude-generated vs. modified + why).

## Stack (decision — deliberately lean)
- **Next.js (App Router) + Vercel AI SDK v7, deployed on Vercel.** One app, one deploy.
- **RAG = precomputed embeddings bundled in repo + in-memory cosine top-k.** No vector DB. Build script chunks `/content/*.md` → `embedMany(text-embedding-3-small)` → `data/embeddings.json` (chunk + vector + source/section metadata). Runtime: `embed(query)` → `cosineSimilarity` → top-k (3–5) → inject → `streamText`. Brute-force is correct at this scale (sub-ms). Use `dimensions: 512` to shrink the file.
- **LLM: provider-agnostic** via AI SDK (lock model when the key arrives — OpenRouter or OpenAI). **Embeddings need an OpenAI-compatible embeddings endpoint** — if Cadre's key can't do embeddings (e.g. Anthropic-only, or OpenRouter embeddings flaky), use a cheap OpenAI key for `text-embedding-3-small` (pennies) and note it. Precompute KB embeddings at build; only the query is embedded at runtime.
- **Persistence: none for the chatbot (Tier 0).** Only Tier 1 (admin/logs) adds **Upstash Redis** (serverless HTTP, free tier) for conversation + escalation logs — the single justified external service, and only for the observability stretch.
- **NOT using** (state why in README): pgvector/Supabase (overkill at 8 docs), heavy local vector DBs (ephemeral-FS problem on serverless), Obsidian tooling (a vault is just markdown).
- Serverless gotchas to respect: ephemeral FS → RAG data is a read-only bundled file; AI SDK has no vector store (storage is ours); pin AI SDK v7.

## Knowledge base design
- `/content/*.md`, one topic per file, minimal frontmatter (`title`, `tags`): what Cadre does · industries · core services · **AI Maturity Index** · **LLM-selection + data-security** approach · **book a strategy call** · **client-portal access** · FAQ / escalation. (Source: Cadre public info + our recon.)
- Chunk by heading (`MarkdownHeaderTextSplitter`-style), ~300–500 tokens, ~15% overlap, never split tables/code, **prepend `title | section`** to each chunk, store `source/title/section/tags` as metadata (enables citation + filtering).

## Scope tiers (put verbatim in `plan.md` — the graded judgment)
### Tier 0 — MUST SHIP (passes alone)
Streaming chat UI + scenario chips · RAG-grounded answers · **guardrails** (answer only from retrieved context; refuse to invent pricing/services; weak/no retrieval → "I don't know, let me connect you") · **escalation** (booking / human / unanswerable → capture email + CTA) · deployed URL + fresh repo + `CLAUDE.md` + `plan.md`.
### Tier 1 — STRETCH (cut cleanly if time short)
Ultra-thin **read-only admin**: recent conversations · escalations/leads · **retrieval trace** (which chunks + scores per answer) · **KB-gap view** (low-confidence questions = what to add → the "does-it-stick" loop). Plus the **eval runner** (below).
### OUT — declared cuts
Real end-user portal/auth · live Calendly/booking API · AI-Maturity-Index scoring engine · fine-tuning · multi-tenant · cross-session memory · vector DB · full admin/RBAC.

## Architecture (modules + interfaces so the swarm can parallelize)
`Chat UI → /api/chat → embed(query) → cosine top-k over bundled vectors → build messages (system prompt + context + trimmed history) → streamText → guardrail/escalation check → stream + (Tier1) log to Upstash`.
- `content/*.md` (KB) · `scripts/embed.ts` (build-time ingest) · `data/embeddings.json` (artifact) · `lib/retrieval.ts` · `lib/llm.ts` (provider adapter) · `lib/prompt.ts` (persona + grounding + guardrails + escalation triggers) · `app/api/chat/route.ts` · `app/(chat)/` · `app/admin/` (Tier1) · `evals/` (golden set + runner).
- Fix the module interfaces up front (function signatures + the `embeddings.json` schema) so agents build against contracts without collisions.

### Interface contracts (lock before parallel build)
Concrete shapes so KB / retrieval / API / UI agents build against fixed contracts.

```ts
// data/embeddings.json  (generated by scripts/embed.ts; read-only at runtime)
type EmbeddingsFile = {
  model: string;          // e.g. "text-embedding-3-small"
  dimensions: number;     // 512
  chunks: Chunk[];
};
type Chunk = {
  id: string;             // `${source}#${index}`
  text: string;           // chunk body, prefixed with "title | section"
  embedding: number[];    // length === dimensions
  meta: { source: string; title: string; section: string; tags: string[] };
};

// lib/retrieval.ts
type Retrieved = { chunk: Chunk; score: number };            // score = cosine sim
function topK(queryVec: number[], k?: number): Retrieved[];  // default k = 4

// lib/llm.ts
function embedQuery(text: string): Promise<number[]>;        // 512-dim, same model as build
// chat generation goes through Vercel AI SDK streamText in the route

// lib/prompt.ts
function buildMessages(args: {
  query: string;
  context: Retrieved[];
  history: { role: "user" | "assistant"; content: string }[];
}): CoreMessage[];

// POST /api/chat  →  Vercel AI SDK data stream (streamText().toDataStreamResponse())
// Request body: { messages: UIMessage[] }
// On weak retrieval (top score < THRESHOLD) or off-topic → escalation response, not a guess.
```
- `RETRIEVAL_THRESHOLD` (cosine) is the single guardrail knob — tune against the golden set; start ~0.35 and calibrate.

### Golden set (write first — `evals/golden.json`)
6 core scenarios + 3 adversarial. Each entry: `{ id, question, expect: { grounded|refuse|escalate }, mustCite?, mustNotSay? }`.
- Core: what Cadre does · core services · AI Maturity Index · LLM-selection + data-security approach · book a strategy call · client-portal access.
- Adversarial: `"what's your pricing?"` → refuse/escalate (no invented numbers) · off-topic (e.g. weather) → decline · hallucination bait (plausible fake service) → stays grounded + cites source.

### Env / config
- `AI_PROVIDER` + model id (lock when key arrives) · chat LLM key · embeddings key (OpenAI-compatible; may differ from chat provider).
- Tier 1 only: `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`.
- `.env.example` committed; real keys never committed. Build step reads embeddings key; runtime reads chat key.

## Engineering process — systematic, swarm-orchestrated (the core of this plan)
A rigorous, eval-first SDLC executed by a **hierarchical agent swarm**. Run the swarm **through Claude Code subagents** (the Task tool) with `CLAUDE.md` as the shared contract — optionally coordinated with claude-flow memory. ⚠️ **Caveat:** Cadre grades *native Claude Code* (30%); keep the Claude Code artifacts (`CLAUDE.md`, `plan.md`, subagents, custom commands) front-and-center and legible — claude-flow is coordination glue, not a substitute, and be ready to explain the orchestration.

**Phase A — Specification (no code yet).** Extract a crisp spec from the brief → `SPEC.md` (scenarios, scope IN/OUT, success criteria, non-goals). Write `CLAUDE.md` (contract) + `plan.md` (phases + scope). **Write the eval/golden set FIRST** → `evals/golden.json` (the 6 scenarios + adversarial: off-topic, "what's your pricing?", hallucination bait). This is TDD for the bot — "correct" is defined before building, mirroring Cadre's validation POV.

**Phase B — Architecture (architect/coordinator agent).** Lock modules, data flow, interfaces, the `embeddings.json` schema, and the right-sized tech decisions + "when I'd scale up" thresholds.

**Phase C — Swarm build (parallel where independent).** Coordinator spawns specialized agents against the fixed interfaces:
- KB agent → author `content/*.md` + `scripts/embed.ts`.
- Retrieval/LLM agent → `lib/retrieval.ts`, `lib/llm.ts`.
- Chat-API agent → `app/api/chat` (prompt + retrieval + streaming + logging hook).
- UI agent → chat UI + chips + escalation.
- (Tier1) Admin agent → read-only dashboard. Test agent → eval runner.
KB + UI run alongside API once interfaces are fixed; dependent work is sequential.

**Phase D — Verify loop (every slice).** Deploy hello-world day 1, then redeploy each vertical slice. After each module: run its checks; once chat works, run the golden set; fix. **Reviewer agent** does a self-review pass (clean code, error handling, catches AI bugs, no leaked keys, input validation).

**Phase E — Verification-before-done.** Full eval + adversarial **live on the deployed URL**. Error handling: LLM/embeddings failure + empty retrieval → escalate. Tier1: confirm logs/retrieval-trace visible in admin. Update `DECISIONS.md`.

**Phase F — Completion.** `README` (rationale + scale thresholds + cuts + "what's next") · final deploy · push · submit ≥1 business day before the review.

## Verification (prove it end-to-end)
- **Live URL:** 6 scenarios + adversarial — "what's your pricing?" must refuse/escalate; off-topic declined; hallucination bait stays grounded + cites source.
- **Eval:** `pnpm eval` → golden-set pass/fail report.
- **Tier1 admin:** conversations + escalations logged; retrieval trace shows real chunks + scores.
- **Deploy:** public URL streams, no server errors (Vercel logs).
- **Review demo script:** scenarios → guardrail refusal → escalation → (admin observability) → walk `CLAUDE.md`/`plan.md`/swarm subagents/`DECISIONS.md` → honest cuts + "what I'd do with more time."

## Over-build guardrails
- Tier 0 deployed & working **before any** Tier 1 work; deploy day 1.
- Keep the KB ~8–10 docs (retrieval quality > size); no vector DB.
- Time-box Tier 1; if it slips, ship Tier 0 and **declare the cut** (rewarded over a broken mess).
- The swarm/process is for rigor + parallelism — it must not add product complexity Cadre would flag.
