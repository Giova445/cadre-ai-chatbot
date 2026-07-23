# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status: greenfield

Only [plan.md](plan.md) exists so far — no application code, `package.json`, or build config yet. `plan.md` is the authoritative contract; build against it. This file summarizes the decisions a future instance needs before there is code to read. Update it once real modules land (fill in exact commands, correct any drift from the plan).

## What this is

A customer-support chatbot for **Cadre AI** — a RAG system that answers only from a small bundled knowledge base, refuses to invent facts (pricing/services), and escalates (booking / human handoff / lead capture) when retrieval is weak or the request is out of scope. Take-home for an FDE loop; graded on Claude Code usage (30%), architecture (25%), speed/scope (20%), code quality (15%), communication (10%).

## Stack (decided — deliberately lean; do not add infra)

- **Next.js (App Router) + Vercel AI SDK v7**, deployed on **Vercel**. One app, one deploy. Pin AI SDK to v7.
- **RAG without a vector DB.** Precompute embeddings at build time into a bundled `data/embeddings.json`; at runtime embed only the query and do in-memory cosine top-k (3–5). Brute force is correct at this scale (~8–10 docs) — sub-ms. Use `text-embedding-3-small` with `dimensions: 512` to keep the file small.
- **LLM is provider-agnostic** through the AI SDK (lock the model when the key arrives; OpenRouter or OpenAI). Embeddings need an OpenAI-compatible endpoint — if the provided key can't embed, use a cheap OpenAI key for `text-embedding-3-small` and note it.
- **Persistence: none for Tier 0.** Only the Tier 1 admin stretch adds **Upstash Redis** (serverless HTTP) for conversation + escalation logs. It is the single justified external service.

**Explicitly rejected (state why in README if asked):** pgvector/Supabase (overkill at this doc count), heavy local vector DBs (serverless ephemeral-FS problem), any cross-session memory or multi-tenant/auth. Do not reach for these.

### Serverless constraints that shaped the design

- Ephemeral filesystem → RAG data must be a **read-only bundled artifact**, never written at runtime.
- The AI SDK has no vector store — storage/retrieval is our code.

## Architecture

Data flow:

```
Chat UI → /api/chat → embed(query) → cosine top-k over bundled vectors
        → build messages (system prompt + retrieved context + trimmed history)
        → streamText → guardrail / escalation check → stream (+ Tier1: log to Upstash)
```

Module layout (fix the interfaces — function signatures + the `embeddings.json` schema — before parallel work so agents don't collide):

- `content/*.md` — knowledge base, one topic per file, minimal frontmatter (`title`, `tags`).
- `scripts/embed.ts` — build-time ingest: chunk by heading (~300–500 tokens, ~15% overlap, never split tables/code), prepend `title | section` to each chunk, `embedMany` → write `data/embeddings.json` with `source/title/section/tags` metadata.
- `data/embeddings.json` — generated artifact (chunk text + vector + metadata). Do not hand-edit.
- `lib/retrieval.ts` — cosine top-k over the bundled vectors.
- `lib/llm.ts` — provider adapter.
- `lib/prompt.ts` — persona + grounding + guardrails + escalation triggers.
- `app/api/chat/route.ts` — the streaming endpoint tying it together.
- `app/(chat)/` — chat UI + scenario chips + escalation flow.
- `app/admin/` — Tier 1, read-only dashboard.
- `evals/` — golden set + runner.

## Guardrails (product behavior — these are requirements, not style)

- Answer **only** from retrieved context. Refuse to invent pricing or services.
- Weak/empty retrieval → don't guess: say "I don't know, let me connect you" and escalate.
- Escalation paths: booking a strategy call, human handoff, and lead capture (email + CTA).

## Scope tiers (the graded judgment — respect the order)

- **Tier 0 (must ship, passes alone):** streaming chat + chips, RAG-grounded answers, guardrails, escalation, deployed URL, fresh repo, `CLAUDE.md` + `plan.md`. **Ship and deploy Tier 0 before any Tier 1 work.**
- **Tier 1 (stretch, cut cleanly if short):** ultra-thin read-only admin (recent conversations, escalations/leads, retrieval trace = which chunks + scores, KB-gap view) + the eval runner. Time-box it; if it slips, ship Tier 0 and declare the cut.
- **Out (declared cuts):** real portal/auth, live booking API, maturity-index scoring engine, fine-tuning, multi-tenant, cross-session memory, vector DB, full RBAC.

## Process

Eval-first (TDD for the bot): write `evals/golden.json` — the 6 core scenarios plus adversarial cases (off-topic, "what's your pricing?", hallucination bait) — **before** building, so "correct" is defined first. Deploy a hello-world day 1, then redeploy each vertical slice; run the golden set once chat works.

Maintain **`DECISIONS.md`**: for notable code, record whether it was Claude-generated vs. modified, and why. This is explicitly part of the deliverable.

## Commands (planned — confirm/replace once `package.json` exists)

Package manager is **pnpm** per the plan.

```bash
pnpm install
pnpm dev          # Next.js dev server
pnpm build        # includes running scripts/embed.ts to regenerate data/embeddings.json
pnpm eval         # run the golden-set eval runner → pass/fail report
```

There is no lint/test config yet — add the real commands here when they're set up.
