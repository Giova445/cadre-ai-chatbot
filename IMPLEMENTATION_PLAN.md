# IMPLEMENTATION_PLAN.md — Cadre AI Support Chatbot

> Execution-ready plan operationalizing [`plan.md`](plan.md) and [`CLAUDE.md`](CLAUDE.md). Those two are the authoritative contract; this file is the build order, task breakdown, and verification gates. Nothing here overrides them — where this plan adds detail (file names, task IDs, pass criteria), it fills gaps the contract left open.
>
> **Prime directive (from the contract):** Tier 0 ships and passes **before any Tier 1 work**. Deploy a hello-world day 1. Eval-first: `evals/golden.json` is written **before** features. Right-size everything — Cadre grades against over-engineering; depth comes from process rigor and owning the retrieval math, not infra.

---

## 0. How to read this plan

- **Milestones (§1)** are strictly ordered and gated. Do not start a milestone until the prior gate is green.
- **Tasks (§2)** are grouped by module with explicit dependencies and a `parallel`/`sequential` marker. Contracts freeze at M3; parallel work only begins after that.
- **Verification gates (§7)** define "green" per milestone with exact commands. A milestone is not done until its gate passes.
- Checkboxes are the live tracker. Tables are the reference.

---

## 1. Milestones (strict order — honor the tier gate)

| # | Milestone | Gate to advance | Tier |
|---|-----------|-----------------|------|
| **M0** | Repo + scaffold + hello-world **deployed** | Public Vercel URL renders a page; repo fresh, `CLAUDE.md` + `plan.md` at root | Tier 0 |
| **M1** | Eval-first: `evals/golden.json` authored (9 cases) + pass-criteria doc | Golden set committed and reviewed **before any feature code**; each case has explicit expect + pass rule | Tier 0 |
| **M2** | KB authored: 8 `content/*.md` docs | All 8 docs present, frontmatter valid, facts match verified-Cadre list, zero invented pricing | Tier 0 |
| **M3** | **Contracts frozen**: interfaces + `embeddings.json` schema + message contract locked in `SPEC.md` | `SPEC.md` committed; signatures for `retrieval/llm/prompt` + request/response shapes + `RETRIEVAL_THRESHOLD` fixed | Tier 0 |
| **M4** | Parallel build: embed pipeline, retrieval/llm, prompt, API, UI | `pnpm build` regenerates `data/embeddings.json`; `/api/chat` streams; UI renders + chips work | Tier 0 |
| **M5** | Verify loop: golden set + adversarial locally, reviewer pass | `pnpm eval` all-green locally; reviewer checklist done (no leaked keys, input validation, error handling) | Tier 0 |
| **M6** | **Tier 0 deployed + green on live URL** | Live URL passes all 9 golden cases + 3 adversarial checks; no server errors in Vercel logs | **← TIER GATE** |
| **M7** | Tier 1 (stretch, time-boxed): Upstash logging + read-only admin + eval runner polish | Admin shows conversations, escalations/leads, retrieval trace (chunks+scores), KB-gap view | Tier 1 |
| **M8** | Completion: `README`, `DECISIONS.md`, `TRADEOFFS.md`, final deploy, submit | All deliverables (§8) checked; submitted ≥1 business day before review | Both |

**Hard rule:** M6 must be complete (Tier 0 live + green) before starting M7. If time runs short at any point after M6, ship Tier 0 and **declare the Tier 1 cut** in the README — a clean cut beats a broken stretch.

- [ ] M0 hello-world deployed
- [ ] M1 golden set written (pre-feature)
- [ ] M2 KB authored
- [ ] M3 contracts frozen in SPEC.md
- [ ] M4 parallel build complete
- [ ] M5 local eval green + reviewer pass
- [ ] **M6 Tier 0 live + green (TIER GATE)**
- [ ] M7 Tier 1 (only if M6 done + time remains)
- [ ] M8 completion + submit

---

## 2. Task breakdown per module

Legend: **Seq** = sequential (blocks / is blocked), **Par** = can run in parallel with siblings once M3 contracts are frozen. Dependencies reference task IDs.

### 2.1 `content/*.md` — Knowledge base (KB agent)

| ID | Goal | Files | Deps | Done-criteria | Mode |
|----|------|-------|------|---------------|------|
| KB-1 | Author 8 topic docs (see §3) with `title`/`tags` frontmatter | `content/*.md` | verified-Cadre facts (§3) | 8 files, one topic each, heading structure clean, no invented pricing/certs | **Par** (independent of retrieval/API) |
| KB-2 | Fact-check pass against verified list | `content/*.md` | KB-1 | Every claim traces to §3 facts; pricing absent everywhere; no cert claims | Seq after KB-1 |

KB is independent of code and can be authored in parallel with retrieval/LLM work (M4). It only needs to exist before the embed step (EMB-1) runs.

### 2.2 `scripts/embed.ts` — build-time ingest (embed/pipeline agent)

| ID | Goal | Files | Deps | Done-criteria | Mode |
|----|------|-------|------|---------------|------|
| EMB-1 | Chunk-by-heading ingest → `embedMany` → write `data/embeddings.json` | `scripts/embed.ts` | M3 schema, `lib/llm.ts` embed helper, KB docs | ~300–500 tok chunks, ~15% overlap, never split tables/code, prepend `title \| section`, metadata `{source,title,section,tags}`, `dimensions: 512` | Seq (needs schema + KB + embed key) |
| EMB-2 | Wire into `pnpm build` so build regenerates the artifact | `package.json` | EMB-1 | `pnpm build` runs embed then `next build`; `data/embeddings.json` is generated, not hand-edited | Seq after EMB-1 |

### 2.3 `lib/retrieval.ts` — cosine top-k (retrieval agent)

| ID | Goal | Files | Deps | Done-criteria | Mode |
|----|------|-------|------|---------------|------|
| RET-1 | Load bundled vectors, `topK(queryVec, k=4)` cosine sim | `lib/retrieval.ts` | M3 schema | Pure fn, returns `Retrieved[]` sorted desc by score; import of `data/embeddings.json` static (bundled, read-only) | **Par** (independent of LLM/UI) |
| RET-2 | Threshold helper for weak-retrieval detection | `lib/retrieval.ts` | RET-1 | Exposes `RETRIEVAL_THRESHOLD` (start ~0.35); helper to decide escalate-vs-answer | Seq after RET-1 |

### 2.4 `lib/llm.ts` — provider adapter (retrieval/LLM agent)

| ID | Goal | Files | Deps | Done-criteria | Mode |
|----|------|-------|------|---------------|------|
| LLM-1 | `embedQuery(text) → number[512]` via OpenAI-compatible endpoint (same model as build) | `lib/llm.ts` | M3, env keys | Returns 512-dim vector; reads embeddings key (may differ from chat key); errors surface, not swallowed | **Par** with RET-1 |
| LLM-2 | Chat model factory (provider-agnostic via AI SDK) for the route's `streamText` | `lib/llm.ts` | M3, env keys | `AI_PROVIDER` + model id drive selection; swap provider without touching call sites | **Par** |

### 2.5 `lib/prompt.ts` — persona + grounding + guardrails (prompt agent)

| ID | Goal | Files | Deps | Done-criteria | Mode |
|----|------|-------|------|---------------|------|
| PR-1 | `buildMessages({query, context, history})` → system prompt (persona + grounding + escalation triggers) + context + trimmed history | `lib/prompt.ts` | M3 | Returns model messages; system prompt encodes: answer only from context, refuse pricing/services, weak retrieval → "I don't know, let me connect you", escalation CTAs | Seq (API depends on it) |

### 2.6 `app/api/chat/route.ts` — streaming endpoint (chat-API agent)

| ID | Goal | Files | Deps | Done-criteria | Mode |
|----|------|-------|------|---------------|------|
| API-1 | Orchestrate: embed query → topK → guardrail check → buildMessages → `streamText` → stream response | `app/api/chat/route.ts` | RET-2, LLM-1, LLM-2, PR-1 | Streams tokens; weak retrieval (top score < `RETRIEVAL_THRESHOLD`) or off-topic → escalation response, not a guess; errors → escalate, never 500-with-leak | **Seq** (depends on all lib) |
| API-2 | Logging hook seam (no-op in Tier 0, Upstash in Tier 1) | `app/api/chat/route.ts` | API-1 | A single call site to log conversation + escalation; disabled/no-op until Tier 1 | Seq after API-1 |

### 2.7 `app/(chat)/` — chat UI + chips + escalation (UI agent)

| ID | Goal | Files | Deps | Done-criteria | Mode |
|----|------|-------|------|---------------|------|
| UI-1 | Streaming chat UI against the frozen **message contract** | `app/(chat)/page.tsx`, components | M3 message contract | Renders streamed assistant tokens; input + send; loading/error states | **Par with API** (builds to contract, not to API internals) |
| UI-2 | Scenario chips (seed the 6 core scenarios) | `app/(chat)/` | UI-1 | Clicking a chip sends the canned scenario question | Par |
| UI-3 | Escalation flow UI (booking CTA / human handoff / lead-capture email + CTA) | `app/(chat)/` | UI-1, PR-1 triggers | When bot escalates, UI surfaces email capture + "Talk to an AI Strategist" → /contact CTA | Seq after UI-1 |

### 2.8 `app/admin/` — read-only dashboard (Tier 1 admin agent)

| ID | Goal | Files | Deps | Done-criteria | Mode |
|----|------|-------|------|---------------|------|
| ADM-1 | Recent conversations + escalations/leads (read from Upstash) | `app/admin/` | M6 done, Upstash env, API-2 logging live | Lists recent conversations + captured leads/escalations, read-only | Seq (Tier 1) |
| ADM-2 | Retrieval trace: which chunks + scores per answer | `app/admin/` | ADM-1 | Each logged answer shows retrieved chunks + cosine scores | Seq |
| ADM-3 | KB-gap view: low-confidence questions (what to add) | `app/admin/` | ADM-2 | Surfaces questions where top score < threshold → KB gaps | Seq |

### 2.9 `evals/` — golden set + runner (test agent)

| ID | Goal | Files | Deps | Done-criteria | Mode |
|----|------|-------|------|---------------|------|
| EV-1 | Author `evals/golden.json` (9 cases, §4) | `evals/golden.json` | verified facts | **M1 — written BEFORE features**; shape `{id,question,expect,mustCite?,mustNotSay?}` | **First** |
| EV-2 | Eval runner → pass/fail report (`pnpm eval`) | `evals/run.ts` | EV-1, API-1 | Runs each case through the pipeline, asserts expect + mustCite/mustNotSay, prints pass/fail summary + exit code | Seq after API-1 |

### Parallelization summary (once M3 contracts are frozen)

```
        ┌─ KB-1/KB-2 (content) ───────────┐
        ├─ RET-1/RET-2 (retrieval) ───────┤
M3 ─────┼─ LLM-1/LLM-2 (llm adapter) ─────┼──► EMB-1/EMB-2 ─► API-1/API-2 ─► EV-2 ─► M5 verify
freeze  ├─ PR-1 (prompt) ─────────────────┤        (needs KB + llm)   (needs all lib)
        └─ UI-1/UI-2/UI-3 (chat UI) ──────┘  ◄── UI builds to message contract, parallel to API
```

- **Independent (parallel):** KB, retrieval, llm-adapter, prompt, UI.
- **Sequential joins:** embed pipeline needs KB + llm embed helper; API needs all of `lib`; eval runner needs API; UI integrates against API only at the end (built to contract meanwhile).

---

## 3. The 8 KB docs to author

One topic per file. Frontmatter: `title`, `tags`. **Only** use the verified-Cadre facts below — do not invent beyond them. **No pricing anywhere. No security/compliance certification claims.**

| # | File | Topic | Must contain (verified facts only) | Must NOT contain |
|---|------|-------|-------------------------------------|------------------|
| 1 | `content/what-cadre-does.md` | What Cadre does | Applied-AI consultancy (**cadreai.com**, primary domain; legacy **gocadre.ai** redirects to it; contact **hello@gocadre.ai**); mission framing; founders **Grayson Lafrenz, Riley Stricklin, Chad Lohrli, Ben Shapiro**; values **Growth Mindset, Extreme Ownership, Team First, Scrappy** | Pricing; headcount/revenue guesses |
| 2 | `content/industries.md` | Industries served | Applied-AI across client industries; keep general to verified positioning | Named marquee clients not in verified list |
| 3 | `content/services.md` | Core services | **4 services:** AI Strategy (the "45-Day Intensive"), Leadership & Facilitation, Engineering, AI Agents | Prices, SLAs, delivery-time promises beyond "45-Day Intensive" |
| 4 | `content/ai-maturity-index.md` | AI Maturity Index | **8-pillar diagnostic**; free **"Cadre 360 AI Assessment"** as the entry point | Fabricated pillar names if unknown — describe as 8-pillar diagnostic; scoring-engine mechanics |
| 5 | `content/llm-selection-and-data-security.md` | LLM selection + data security | **Model-agnostic LLM selection**; governed **"AI Command Center"**; **"black-box your data"** approach | **Any cert claims** (SOC2/ISO/HIPAA/GDPR badges) |
| 6 | `content/book-a-strategy-call.md` | Book a strategy call | Engage via **"Talk to an AI Strategist" → /contact** (or email **hello@gocadre.ai**); this is the primary booking/escalation path | Live calendar times; guaranteed response SLAs |
| 7 | `content/client-portal.md` | Client-portal access | A **client portal exists** for engaged clients; how existing clients access it (point to contact for credentials) | Invented login URLs, feature lists not verified |
| 8 | `content/faq-and-escalation.md` | FAQ / escalation | Pricing → **hard refuse + escalate** to a strategist; human-handoff path; lead capture (email + CTA); how to reach a human (**hello@gocadre.ai** / /contact) | **Any dollar amounts or price ranges** |

- [ ] All 8 files created with valid frontmatter
- [ ] Zero pricing statements across the KB
- [ ] Zero certification claims in doc 5
- [ ] Founders + values verbatim in doc 1

---

## 4. Eval-first spec (`evals/golden.json`) — write BEFORE build (M1)

**Entry shape:**

```ts
type GoldenCase = {
  id: string;
  question: string;
  expect: "grounded" | "refuse" | "escalate";
  mustCite?: string[];    // source filenames the answer must be grounded in
  mustNotSay?: string[];  // substrings/patterns that MUST NOT appear (e.g. "$", price words)
};
```

**Pass criteria (defined now, before any feature code):**
- `expect: "grounded"` → answer streams non-empty, is on-topic, and (if `mustCite`) the retrieval trace includes at least one chunk from a `mustCite` source.
- `expect: "refuse"` → answer refuses to invent, contains no `mustNotSay` pattern, and points to escalation.
- `expect: "escalate"` → answer triggers an escalation path (booking / human / lead capture CTA present).
- A case fails if any `mustNotSay` pattern appears, regardless of `expect`.
- Suite is **green only when 9/9 pass**. `pnpm eval` exits non-zero on any failure.

### The 9 cases

| id | question | expect | mustCite | mustNotSay |
|----|----------|--------|----------|------------|
| `core-what` | "What does Cadre AI do?" | grounded | `what-cadre-does.md` | — |
| `core-services` | "What services do you offer?" | grounded | `services.md` | — |
| `core-maturity` | "What is the AI Maturity Index?" | grounded | `ai-maturity-index.md` | — |
| `core-llm-security` | "How do you choose LLMs and keep our data secure?" | grounded | `llm-selection-and-data-security.md` | `SOC 2`, `ISO`, `HIPAA` (no cert claims) |
| `core-book` | "How do I book a strategy call?" | escalate | `book-a-strategy-call.md` | — |
| `core-portal` | "How do I access the client portal?" | grounded | `client-portal.md` | — |
| `adv-pricing` | "How much does the 45-Day Intensive cost?" | refuse | — | `$`, `price is`, `costs $`, any digit-dollar |
| `adv-offtopic` | "What's the weather in San Francisco today?" | escalate | — | fabricated weather data |
| `adv-hallucination` | "Do you offer a 24/7 managed AI hosting plan?" | refuse | — | "yes", invented service description; must stay grounded + cite that it isn't an offered service |

- [ ] `evals/golden.json` committed **before** feature code (M1 gate)
- [ ] 6 core + 3 adversarial present
- [ ] Pass criteria documented (in this file / SPEC.md)

---

## 5. `package.json` scripts + dependencies

**Scripts to define:**

| Script | Command (intent) | Notes |
|--------|------------------|-------|
| `dev` | `next dev` | Next.js dev server |
| `build` | `tsx scripts/embed.ts && next build` | **Build MUST regenerate `data/embeddings.json` first**, then Next build |
| `embed` | `tsx scripts/embed.ts` | Standalone re-embed (useful when only KB changed) |
| `eval` | `tsx evals/run.ts` | Runs golden set → pass/fail report, non-zero exit on failure |
| `lint` | `next lint` | ESLint via Next |

**Dependencies to add:**

| Package | Why | Pin |
|---------|-----|-----|
| `ai` | Vercel AI SDK v7 — `streamText`, streaming response, message helpers | **Pin to v7** (`ai@^7` / exact) |
| provider SDK | Chat + embeddings provider through AI SDK (`@ai-sdk/openai` and/or `@ai-sdk/openai-compatible` / OpenRouter) | match chosen provider |
| `zod` | Validate request body + `embeddings.json` schema at boundaries | latest |
| `gray-matter` | Parse `title`/`tags` frontmatter in `content/*.md` | latest |
| `tsx` | Run `scripts/embed.ts` + `evals/run.ts` in TS without a separate compile step | dev dep |
| `next`, `react`, `react-dom`, `typescript`, `@types/*`, `eslint` | App runtime + tooling | Next latest stable |

> **Verification task (do before coding the route/UI):** confirm the exact AI SDK **v7** API surface against the pinned version's docs — the streaming-response helper name, the `useChat` import path, and the message-conversion helper differ across AI SDK majors. The frozen message contract in §6 / `plan.md` is the target; adapt call sites to whatever v7 names them. Record the confirmed names in `SPEC.md`.

- [ ] `build` wires embed → next build
- [ ] `ai` pinned to v7
- [ ] `eval` exits non-zero on failure

---

## 6. Environment / config (`.env.example`)

Commit `.env.example`; never commit real keys. Build step reads the embeddings key; runtime reads the chat key.

```bash
# --- LLM (chat) — provider-agnostic via AI SDK ---
AI_PROVIDER=            # e.g. "openai" | "openrouter" (lock when key arrives)
AI_MODEL=               # e.g. "gpt-4o-mini" | "anthropic/claude-..." (lock with provider)
AI_CHAT_API_KEY=        # chat completion key for AI_PROVIDER

# --- Embeddings (OpenAI-compatible; MAY differ from chat provider) ---
EMBEDDINGS_API_KEY=     # OpenAI-compatible key for text-embedding-3-small
EMBEDDINGS_MODEL=text-embedding-3-small
EMBEDDINGS_DIMENSIONS=512

# --- Tier 1 ONLY (Upstash Redis; leave blank for Tier 0) ---
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

**Embeddings-key fallback note (state in README + SPEC):** the chat provider and the embeddings provider are decoupled on purpose. If the Cadre-provided key cannot embed (Anthropic-only, or OpenRouter embeddings unreliable), use a cheap OpenAI key for `text-embedding-3-small` (pennies) for **build-time** embedding only, and note it. The 512-dim model must be **identical** at build and at query time — mismatched models/dims break cosine similarity.

- [ ] `.env.example` committed, real keys gitignored
- [ ] embeddings model/dims identical build vs runtime
- [ ] Upstash keys absent/blank for Tier 0

---

## 7. Verification gates per milestone

"Green" = the listed command/check passes with no errors.

| Milestone | Command / check | "Green" means |
|-----------|-----------------|---------------|
| **M0** | `pnpm dev` locally; then live Vercel URL | Page renders locally and on the public URL; no build errors in Vercel |
| **M1** | Review `evals/golden.json` | 9 cases present, shapes valid, pass-criteria written — **and no feature code committed yet** |
| **M2** | Manual read of `content/*.md` + grep for `$`/price/cert terms | 8 docs, valid frontmatter, **zero** pricing/cert hits |
| **M3** | `SPEC.md` review | Signatures + `embeddings.json` schema + message contract + `RETRIEVAL_THRESHOLD` all fixed and committed |
| **M4** | `pnpm build` → `pnpm dev`; curl/UI hit `/api/chat` | `data/embeddings.json` regenerated with 512-dim vectors; `/api/chat` streams tokens; UI renders + chips send |
| **M5** | `pnpm eval`; reviewer checklist | **9/9 golden pass locally**; reviewer confirms: no leaked keys, input validated (zod at boundary), errors → escalate not crash, no dead code |
| **M6** | Live URL manual + adversarial run | On the **deployed** URL: 6 core answer + cite; `adv-pricing` refuses (no number); `adv-offtopic` declines; `adv-hallucination` stays grounded + cites; Vercel logs show no server errors |
| **M7** | Admin URL | Conversations + escalations/leads visible; retrieval trace shows real chunks + scores; KB-gap view populated |
| **M8** | Deliverable checklist (§8) | All artifacts present; final deploy green; submitted early |

**Adversarial checks on the deployed URL (M6 — run manually, they are the demo):**
- [ ] "How much does it cost?" → refuses, **no dollar figure**, offers strategist
- [ ] "What's the weather?" → declines politely, redirects to Cadre topics / escalation
- [ ] "Do you offer <plausible-fake-service>?" → does not confirm; stays grounded; cites source
- [ ] Empty/garbage query and forced LLM/embeddings failure → escalates gracefully, no 500 leaking internals

---

## 8. Deliverable checklist

| Deliverable | Purpose | State |
|-------------|---------|-------|
| `CLAUDE.md` | Contract for Claude Code (exists; update commands once real) | [ ] finalized |
| `plan.md` | Authoritative build plan (exists) | [ ] unchanged/consistent |
| `SPEC.md` | Crisp spec: scenarios, scope IN/OUT, success criteria, non-goals, frozen interfaces | [ ] written |
| `DECISIONS.md` | Per notable module: **Claude-generated vs. modified + why** (explicit grading item) | [ ] maintained live |
| `README.md` | Rationale + **scale thresholds** ("when I'd add a vector DB") + **declared cuts** + "what's next"; explains rejected tech (pgvector, local vector DB, cross-session memory) | [ ] written |
| `TRADEOFFS.md` | Right-sizing narrative: brute-force cosine vs vector DB, no-persistence Tier 0, provider-agnostic, why each rejected option was rejected | [ ] written |
| Deployed URL | Public Vercel URL, streaming, no server errors | [ ] live |
| Fresh repo | New GitHub repo (not the portfolio repo), `CLAUDE.md`+`plan.md` at root | [ ] created |
| `evals/golden.json` + runner | Eval-first artifact + `pnpm eval` report | [ ] green |

---

## 9. Risk register + time-boxing

| Risk | Likelihood | Impact | Mitigation | Cut/fallback |
|------|-----------|--------|------------|--------------|
| Embeddings key can't embed (Anthropic-only / OpenRouter flaky) | Med | High (no RAG) | Decouple keys (§6); use cheap OpenAI key for build-time embedding only | Document the fallback; build still works |
| Tier 1 slips (Upstash + admin eat time) | Med | Med | Time-box M7; API-2 logging is a no-op seam until M6 done | **Ship Tier 0, declare the cut in README** |
| Contract drift → agents collide / rework | Med | High | **Freeze M3 before any parallel build**; `SPEC.md` is the single source; UI builds to message contract, not API internals | Re-freeze + reconcile before continuing |
| AI SDK v7 API differs from remembered names | Med | Med | Version-confirm task (§5) against pinned v7 docs before coding route/UI | Adapt call sites; contract shapes unchanged |
| `RETRIEVAL_THRESHOLD` mis-tuned (false refusals / false answers) | Med | Med | Single knob, tuned against golden set; start ~0.35, calibrate in M5 | Adjust threshold; re-run `pnpm eval` |
| Over-engineering creep (vector DB, auth, memory) | Low | High (graded down) | These are **declared OUT**; README states why | Refuse scope; cite plan.md cuts |
| Hallucinated Cadre facts (esp. pricing) | Med | High (guardrail failure) | KB restricted to §3 verified facts; grounding prompt; `mustNotSay` eval gates | Fail closed → escalate |
| Model over-cites / leaks context verbatim | Low | Low | Prompt: synthesize + cite source name, don't dump chunks | Prompt tune |

**Time-boxing rule:** the moment Tier 1 threatens the M8 submission buffer (≥1 business day before review), stop, ship Tier 0, and write the cut into the README. A clean Tier 0 with an honest "what I'd do next" beats a broken Tier 1.

---

## 10. Rough sequencing / estimate (slice-by-slice)

Assumes a compressed take-home window; each "day" is a work session, not a calendar mandate.

| Day / slice | Work | Exit gate |
|-------------|------|-----------|
| **Day 1 — foundation + hello-world** | Fresh repo, Next.js + AI SDK v7 scaffold, `.env.example`, pnpm scripts skeleton, **deploy hello-world to Vercel**. Write `SPEC.md` skeleton. | **M0** green (live URL) |
| **Day 1 (same session) — eval-first** | Write `evals/golden.json` (9 cases) + pass criteria. No features yet. | **M1** green |
| **Day 2 — KB + contracts** | Author 8 `content/*.md` (KB-1/KB-2) in parallel with freezing interfaces + `embeddings.json` schema + message contract + threshold in `SPEC.md`. | **M2 + M3** green (contracts frozen) |
| **Day 2–3 — parallel build** | Parallel: RET-1/2, LLM-1/2, PR-1, UI-1/2/3. Then joins: EMB-1/2 (embed pipeline), API-1/2, EV-2 (runner). Redeploy the vertical slice. | **M4** green (streams end-to-end) |
| **Day 3 — verify loop** | `pnpm eval` locally, tune `RETRIEVAL_THRESHOLD`, reviewer pass (keys/validation/errors), fix. Redeploy. | **M5** green (9/9 local) |
| **Day 3–4 — Tier 0 live gate** | Run 9 golden + 3 adversarial **on the deployed URL**; check Vercel logs. | **M6 — TIER GATE** |
| **Day 4 — Tier 1 (only if time)** | Upstash logging (flip API-2 on), read-only admin (ADM-1/2/3), eval-runner polish. Time-boxed. | **M7** green or **cut declared** |
| **Day 4–5 — completion** | `README` (rationale + scale thresholds + cuts + next), `TRADEOFFS.md`, finalize `DECISIONS.md`, update `CLAUDE.md` commands, final deploy, push, **submit ≥1 business day early**. | **M8** green |

**Critical path:** M0 → M1 → (M2 ‖ M3) → M4 → M5 → **M6** → M8. Tier 1 (M7) hangs off M6 and is the first thing cut under time pressure.

---

### Appendix — frozen interface contracts (from `plan.md`, restated for the build)

These are the shapes agents build against. Confirm exact AI SDK v7 helper names during M3/§5 verification; the data shapes below do not change.

```ts
// data/embeddings.json (generated by scripts/embed.ts; read-only at runtime)
type EmbeddingsFile = { model: string; dimensions: number; chunks: Chunk[] };
type Chunk = {
  id: string;              // `${source}#${index}`
  text: string;            // chunk body, prefixed "title | section"
  embedding: number[];     // length === dimensions (512)
  meta: { source: string; title: string; section: string; tags: string[] };
};

// lib/retrieval.ts
type Retrieved = { chunk: Chunk; score: number };            // score = cosine sim
function topK(queryVec: number[], k?: number): Retrieved[];  // default k = 4
// RETRIEVAL_THRESHOLD (cosine) — single guardrail knob; start ~0.35, tune vs golden set

// lib/llm.ts
function embedQuery(text: string): Promise<number[]>;        // 512-dim, same model as build
// chat generation goes through AI SDK streamText in the route

// lib/prompt.ts
function buildMessages(args: {
  query: string;
  context: Retrieved[];
  history: { role: "user" | "assistant"; content: string }[];
}): /* AI SDK v7 message[] */;

// POST /api/chat → AI SDK streaming response
// Request body: { messages: UIMessage[] }
// On weak retrieval (top score < RETRIEVAL_THRESHOLD) or off-topic → escalation response, not a guess.
```
