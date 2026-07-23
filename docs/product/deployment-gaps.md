# Deployment Gaps & Production Readiness

> **GAPS review.** Four sibling pillars each planned a product surface for the Cadre AI chatbot:
> **Pillar 1 — embeddable widget** ([`widget.md`](./widget.md)), **Pillar 2 — admin dashboard**
> ([`admin-dashboard.md`](./admin-dashboard.md)), **Pillar 3 — usage & cost**
> ([`usage-and-cost.md`](./usage-and-cost.md)), **Pillar 4 — file embedding / ingestion**
> ([`file-embedding.md`](./file-embedding.md)). Each is internally strong. This document is the
> *seam review*: what breaks when you run all four together as **one deployed, multi-client
> product**, and what deployment-critical concern none of them owns.
>
> **Scope note.** The four pillars are graded as a take-home (Tier 0 must-ship + optional Tier 1).
> Most of what follows is a **blocker for a real multi-client GA launch**, not for the take-home
> demo. Where that distinction matters I mark it **[GA-blocker, not take-home]**. The point of the
> review is that the pillars, read together, *claim* "multi-client" in several places while the
> code and schemas only actually support a single shared tenant — that gap should be named, not
> discovered in production.

---

## Cross-Pillar Reconciliation

The four docs were written in parallel and collide in five concrete places. Two are the datastore
conflicts the brief already flagged; three are correctness/ownership seams that will silently
break if not resolved before build.

### R1 — Two databases where the product needs one story (Redis vs Postgres)

- **Pillar 3** picks **Upstash Redis** as the source of truth for usage rollups + budgets
  (atomic `HINCRBY`, `SET NX` alert latch), citing "the one justified external service."
- **Pillars 2 & 4** both pick **Neon Postgres + pgvector** for conversations, traces, flags,
  documents, versions, and the KB vector store.
- **Pillar 1** reaches for **Upstash Redis** again for its Tier-1 rate limiter.
- **Pillar 4** additionally introduces **Vercel Blob** for raw uploaded file bytes.

Run all four and the product operates **three stateful services** (Neon, Upstash, Blob), each with
its own secret, SLA, backup story, and preview-env isolation problem. Pillar 3's own "one justified
external service" ethos is quietly violated the moment Pillars 2/4 land Postgres — Redis becomes
the *second* service, not the first.

**The deeper problem is not the count, it's that Pillar 3 puts a billing ledger in a cache.**
For a multi-client product, per-client cost is commercial/financial data that must be durable,
backed up, auditable, and **joinable to per-client conversations** (for invoicing and the admin's
per-conversation cost view). Redis rollups are none of those by default. See
[Recommended Data Layer](#recommended-data-layer--shared-infra) for the resolution. Verdict:
**Postgres is the system of record for usage too; Redis, if kept at all, is only a hot-path
counter/limiter that is reconstructable from Postgres.**

### R2 — Doc management is designed twice, incompatibly (Pillars 2 ↔ 4)

Both pillars specify the *same* four tables, the *same* DB-retrieval cutover, and the *same*
ingestion interface — with **different, incompatible** shapes. This is the least-clean seam in the
whole set and will cause a schema/interface collision on day one of Phase 5 / Phase 1.

| Concern | Pillar 2 (admin) | Pillar 4 (ingestion) | Conflict |
|---|---|---|---|
| Table names | `documents`, `document_versions`, `kb_chunks`, `embedding_jobs` | `document`, `document_version`, `chunk`, `ingest_job` | Different names for the same tables |
| Vector type | `halfvec(512)` | `vector(512)` | Different pgvector column types |
| Ingest interface | `IngestionPipeline.ingestDocument({documentId, title, body, tags})` — takes **markdown body** (edit-in-textarea model) | `ingest(versionId)` — async job that reads **raw file bytes from Blob**, extracts PDF/docx | Fundamentally different ingestion models |
| Chunk id | `services.md#3` | `${source}#v${version}#${index}` | Different id schemes; retrieval trace cites these |
| Retrieval flag | `KB_SOURCE=bundle\|db` | `RETRIEVAL_BACKEND=bundle\|pgvector` | Two flags, two `retrieveText` DB implementations, for one cutover |
| Data access | **Drizzle ORM** + drizzle-kit migrations | **hand-rolled thin SQL** + `scripts/migrate.ts` (`CREATE TABLE IF NOT EXISTS`) | Two ORM/migration philosophies against one DB |

**Recommendation:** **Pillar 4 owns the ingestion backend, the table schema, the retrieval-backend
flag, and the DB `retrieveText` path.** Its model is the more complete and correct one (file upload,
Blob-backed raw bytes, immutable versions, version-scoped chunks with atomic swap, HNSW). Pillar 2
**drops** its duplicate schema/interface and consumes Pillar 4's typed service functions
(`listDocuments`, `getDocument`, `reindexDocument`, `reconcile`) for the admin UI. Reconcile to:
one table set (Pillar 4's, plus Pillar 2's `document_versions.body`/status columns folded in only
if the markdown-edit-in-place UX is actually wanted), **one flag** (`RETRIEVAL_BACKEND`),
**one migration tool** (see R5), **`halfvec(512)`** (half the storage, same recall at 512 dims),
and one chunk-id scheme (`${source}#v${version}#${index}`).

> Note the product implication: Pillar 2 assumed docs are *edited as markdown in the dashboard*;
> Pillar 4 assumed docs are *uploaded as files*. Pick the real product behavior. If both are wanted
> (upload files **and** edit markdown), the version model must accept both a `raw_blob_url` source
> and a `body` source — decide this explicitly rather than letting two half-models ship.

### R3 — Conversation identity is designed three ways and Pillar 2's does not work cross-origin

Each pillar invented its own conversation-grouping key:

- **Pillar 1 (widget):** a `conversationId` in **localStorage**, sent in the request **body**.
- **Pillar 3 (usage):** a `conversationId` from the **body** or minted server-side, echoed in a header.
- **Pillar 2 (admin):** a server-set **`cadre_sid` httpOnly cookie, `SameSite=Lax`**.

Pillar 2's cookie approach is **broken for the widget**, which is the product's main deployment
surface. A `SameSite=Lax` cookie is **not sent on cross-site subrequests** (only on top-level
navigations) — so when the widget on `acme.com` fetches `chat.gocadre.ai/api/chat`, `cadre_sid` is
never transmitted and every widget turn logs as a brand-new conversation. Making it work cross-site
requires `SameSite=None; Secure`, which then **is** a third-party cookie: already blocked by default
in Safari and Firefox, and gated behind a user "Privacy Choice" prompt in Chrome as of 2026
([Chrome cookie status 2026](https://cookie-script.com/news/new-future-of-cookies-user-choice-vs-browser-deprecation),
[SameSite=None;Secure requirement, Chrome 80+](https://github.com/GoogleChromeLabs/samesite-examples)).
So a cookie is the *wrong* identity mechanism for an embedded widget on someone else's origin.

**Recommendation:** standardize on a **client-generated `conversationId` (UUID) supplied in the
request body** — the only scheme that works identically for the first-party app, the widget, and
curl. It is not a security identifier (grouping only), so client-supplied is acceptable, but it
**must** be `z.string().uuid()`-validated and **namespaced by `clientId`** so ids can't collide or
be enumerated across tenants. Pillar 2 rewrites `logTurn` to take this body id instead of the
cookie. Keep the cookie only for the first-party admin/app session if desired.

### R4 — `clientId` is client-supplied and forgeable, yet it gates budgets, billing, and (nominally) tenancy

This is the multi-tenancy hole and it lives in the **seam between Pillars 1 and 3**, owned by
neither:

- **Pillar 1** sends `client` in the request body and states plainly it is "for logging and tenant
  routing, *not* for security." Security is the **Origin allowlist**.
- **Pillar 3** requires `clientId` to be **server-authoritative** for budgets/billing to mean
  anything, and explicitly flags the gap: *"without real API-key auth, ceilings are advisory… a
  client-asserted id lets one client bill/evade another's ceiling."*

Nothing in any pillar **binds Origin → clientId**. There is no server-side check that a request
claiming `client:"acme"` actually arrived from an acme-registered origin. Consequences, all
reachable today: a buggy or hostile embed can (a) attribute its spend to a competitor, (b) exhaust
a competitor's budget and trigger their soft-block (a targeted **DoS-by-billing**), (c) pollute
another tenant's usage dashboard. The Origin allowlist does not close this because Origin is
forgeable by non-browser callers (Pillar 1 admits this) and, even from a browser, the allowlist
only asks "is this origin allowed *at all*," never "does this origin own this clientId."

**Recommendation (this is the multi-tenancy keystone — see G3):** introduce a **server-side client
registry** (`origin → clientId → {budget, config, keys}`) and **derive `clientId` from the
validated Origin**, ignoring the body value for billing/enforcement; or issue **per-client
publishable keys**. At minimum, reject any request whose body `client` disagrees with the
Origin-registered client. Until this exists, every "per-client budget / per-client isolation" claim
across Pillars 1/3 is advisory and must be labeled as such.

### R5 — No single owner for migrations, config surface, or the env manifest

- **Migrations:** Pillar 2 uses drizzle-kit (numbered SQL, Neon branch per PR, rollback via flag);
  Pillar 4 uses `scripts/migrate.ts` with `CREATE TABLE IF NOT EXISTS` and **no down-migrations**.
  Two mechanisms against one database guarantees drift. **Pick drizzle-kit** (it has real
  up/down migrations and the Auth.js adapter already needs it); Pillar 4's seed script becomes a
  data-seed step, not a schema-DDL step.
- **Config/env sprawl:** today `lib/config.ts` is ~30 lines. The four pillars each bolt on env
  reads (`WIDGET_ALLOWED_ORIGINS`, `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `UPSTASH_*`,
  `USAGE_*`, `KB_SOURCE`/`RETRIEVAL_BACKEND`, `NEXTAUTH_*`, OAuth secrets, `USAGE_ALERT_WEBHOOK_URL`)
  with no consolidated `.env.example` and no owner for the unified config module. Nominate one
  owner for `lib/config.ts` + `.env.example` so the manifest stays coherent (ties to G4/G8).

---

## Critical Gaps

Severity is ranked against a **multi-client production launch**. "Owner" names the pillar that
should absorb the work, or flags a **new workstream** where no pillar is a natural home.

| # | Gap | Severity | Owner | One-line fix |
|---|---|---|---|---|
| G1 | Unauthenticated `/api/chat` spends LLM $; abuse controls ship as no-ops | **Blocker** | Pillar 1 (+ new *Platform/Abuse* workstream) | Live per-IP + per-client rate limit **on at launch**; not a Tier-1 nicety |
| G2 | Cost-runaway / DoS: rate-limit no-op + soft-block default-off = unbounded spend | **Blocker** | Pillar 3 + Pillar 1 | Enabled-by-default global daily $ cap + per-IP burst limit, enforced pre-model |
| G3 | Multi-tenancy: no tenant isolation of KB, config, budgets; `clientId` forgeable | **Blocker** | **New workstream: Tenancy/Client Registry** | Origin→clientId binding; `client_id` FK on documents/chunks/conversations/usage |
| G4 | Secrets: no rotation runbook, one shared LLM key, no per-client keys | **High** | **New workstream: Shared Infra** | Secret inventory + rotation procedure; decide per-client keys (ties G3) |
| G5 | Observability: errors swallowed silently; no Sentry, no ops alerting, no metrics | **High** | **New workstream: Observability** | Sentry + a structured event on every swallowed `catch`; alert on rates |
| G6 | PII / GDPR: no erasure flow, no subprocessor disclosure, LLM sees conversations | **Blocker (legal)** | Pillar 2 + Shared Infra | Per-tenant/per-conversation deletion API; DPA + subprocessor list; pin LLM no-retention |
| G7 | Widget consent/cookie legality on third-party sites; Lax cookie also broken (R3) | **High** | Pillar 1 | Consent-deferred storage; privacy notice in widget; drop cross-site cookie |
| G8 | CI/CD: no merge gate, two migration tools, preview envs share prod state | **High** | Shared Infra + Pillar 2 | CI runs tests+eval; one migration tool; per-preview DB branch + Redis/Blob namespace |
| G9 | Input safety: no content moderation on input/output; free-LLM-proxy abuse | **Medium–High** | Pillar 1 (public surface) | Free moderation pass on input/output; log injection attempts |
| G10 | Health checks / SLA: no `/api/health`, no dependency probe, no uptime target | **Medium** | Observability workstream | `/api/health` probing DB/Blob/LLM; wire uptime monitor; state SLO |
| G11 | Backups / DR: no stated backup or restore policy for any store | **Medium** | Shared Infra | Verify Neon PITR retention + restore drill; Blob redundancy; Redis reconstructable |

### G1 — Public, unauthenticated, money-spending endpoint with abuse controls stubbed out

`app/api/chat/route.ts` today is an open `POST` that, on the answer path, calls `streamText` against
a paid model. Pillar 1 correctly identifies that **CORS is browser-only** — it stops other sites'
JS from *reading* the response but does nothing to stop a `curl`/server-side caller from *executing*
the request and burning budget. Pillar 1's answer is an Origin 403 short-circuit plus a
**rate-limit *seam* that is a no-op in Tier 0** and only becomes real in Tier 1 (Upstash). The Origin
403 does not fire for requests with **no** `Origin` header (curl, server-to-server) — those "skip
CORS but are still subject to rate limiting," which is a no-op.

Net: at the plan's Tier-0 milestone the endpoint has **zero** effective abuse protection against a
non-browser caller. For a *deployed, multi-client* product this is a launch blocker, not a
follow-up. **Recommendation:** rate limiting must be **live before the first public embed goes GA**.
An unauthenticated origin (no/unknown Origin) gets the strictest bucket; a known client gets its
per-client bucket. This is the per-*request* limiter; G2's budget cap is the per-*dollar* limiter —
both are required and they are different controls.

### G2 — Cost-runaway / DoS is structurally unprotected at the shipping default

Compose the defaults: rate limit = no-op (G1), Pillar 3 `USAGE_SOFT_BLOCK` **default `false`**,
`maxDuration = 60` per request, unlimited concurrency. A trivial loop against the public endpoint
runs up **unbounded** LLM spend, and the only backstop (Pillar 3's global monthly ceiling) is
**off by default** and lives in Redis. Pillar 3 deliberately ships "measurement before enforcement,"
which is right for *calibrating per-client ceilings* but wrong as the *only* line of defense on a
public endpoint.

**Recommendation:** ship an **enabled-by-default hard global daily spend cap** checked
**pre-model** (before embedding and `streamText`), independent of per-client calibration. Pair it
with G1's per-IP burst limit. A global kill-switch (`USAGE_TRACKING_ENABLED=false` reverts the gate)
already exists in Pillar 3 — good — but the *default posture* must be "protected," not "measuring."

### G3 — Multi-tenancy is claimed but not built (isolation of KB, config, budgets, logs)

The product is described as multi-client throughout, but **the schemas have no tenant column**:

- **Pillar 4** `document` / `chunk` tables have **no `client_id`** → there is one **shared KB** for
  all clients. Every embed retrieves from the same corpus. A genuinely multi-client product needs
  per-client knowledge bases (Acme's docs must not answer on Beta's widget).
- **Pillar 2** config/theming and doc CRUD are **not tenant-scoped**; conversations are only
  *tagged* with `client`, not isolated.
- **Pillar 3** is the only per-client dimension, and its key is forgeable (R4).
- Widget config (color/greeting) is per-embed *client-side*, but there is no server-side per-client
  config/budget record.

So "multi-client" today means "one shared bot that logs a forgeable client tag." That may be
acceptable for the take-home, but it must be **stated as a declared cut**, not implied as built.

**Recommendation — stand up a small Tenancy workstream** that owns: the client registry
(R4, `origin → clientId`), a `client_id` FK on `document`/`chunk`/`conversations`/`usage`/`budgets`,
retrieval filtered by `client_id`, and per-client config. This is the single largest architectural
item the four pillars left in the seam. **[GA-blocker; for the take-home, declare single-tenant.]**

### G4 — Secrets management: no rotation, no per-client keys, growing secret surface

Every pillar reads secrets from env (correct) but **no pillar owns rotation or inventory**. The
four together add: `WIDGET_ALLOWED_ORIGINS`, `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`,
`UPSTASH_REDIS_REST_URL/TOKEN`, `USAGE_ALERT_WEBHOOK_URL`, `NEXTAUTH_SECRET` + OAuth client
secret — on top of `AI_CHAT_API_KEY` / `EMBEDDINGS_API_KEY`. There is **one shared LLM key** for
all clients, which means per-client cost is an accounting fiction against a single provider bill,
and a key compromise blasts every client at once. Pillar 3 *assumes* an "API key → clientId" map
exists but **no key is ever issued, stored, or rotated** anywhere in the four plans.

**Recommendation (Shared Infra workstream):** a secret inventory + rotation runbook; per-environment
scoping in Vercel (a leaked preview secret must not be a prod secret); and a decision on **per-client
publishable/secret keys** — which is also what makes Pillar 3's billing identity real (ties to G3).
No secret in `git`; the repo rules already forbid it, but the *rotation* discipline is unwritten.

### G5 — Observability: the system is designed to fail silently

The current route is *excellent* at graceful degradation and *blind* to operators. Every failure is
swallowed:

- `retrieveText` throws → caught → escalate with `reason: embed_error`, **no log**.
- `streamText` throws → caught → `grounded_fallback`, **no log**.
- `iterableStream` mid-stream error → swallowed, stream closed, user sees a truncated answer, **no
  log**.
- Pillar 2 `logTurn` → "swallows the error"; Pillar 3 `recordUsage` → `.catch(() => {})`; Pillar 4
  ingest failure → sets `failed` row (at least persisted).

A systemic embeddings outage, a provider 429 storm, or a DB-down event is **invisible** — the bot
keeps returning polite escalations while nobody is paged. No pillar specifies **error monitoring
(Sentry or equivalent), structured application logs, or alerting on rates** (5xx, elevated
escalation %, `embed_error` %, `logTurn`/`recordUsage` failure %). Pillar 2 explicitly and correctly
declines *product* observability tooling (Langfuse) — but that is not the same as *operational*
observability, which nobody owns.

**Recommendation (Observability workstream):** add Sentry across route + ingest + admin; emit a
structured log/metric on **every** swallowed `catch` with a stable event name; alert on rate
thresholds; adopt request ids. Cheap, and the difference between "we knew in 2 minutes" and "a
client told us."

### G6 — PII / data privacy / retention / the "black-box your data" promise

Pillar 2 does the most here (PII acknowledged, role-gated access, a time-based retention prune
defaulting to 90 days, no secrets in logs). It is still short of what a multi-client, GDPR-facing,
"black-box your data"-branded product needs:

1. **No right-to-erasure flow.** Retention prune is *time-based*, not *request-based*. There is no
   API to delete a specific visitor's data, or a whole tenant's data, on request. GDPR Art. 17
   requires the latter.
2. **Undisclosed subprocessors receiving PII.** Conversations now flow to **Neon**, optionally
   **Upstash**, raw files to **Vercel Blob**, and — critically — **every query goes to the LLM
   provider** (OpenAI or OpenRouter). That is a subprocessor chain with no DPA and no disclosure.
   The "black-box your data" brand promise is *directly contradicted* unless the LLM path is pinned
   to no-retention/no-train. This is configurable and must be set explicitly:
   - **OpenAI API:** inputs/outputs are **not used for training by default**, retained up to ~30
     days for abuse monitoring; **Zero Data Retention** is available for eligible accounts
     ([OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data),
     [OpenAI retention 2026](https://meetily.ai/llm-privacy/openai)).
   - **OpenRouter:** does **not** log prompts by default but **downstream provider** behavior
     varies; you must enforce **ZDR / data-policy filtering** account-wide or per-request to keep
     conversations out of provider logs/training
     ([OpenRouter provider logging](https://openrouter.ai/docs/guides/privacy/provider-logging),
     [OpenRouter ZDR controls](https://meetily.ai/llm-privacy/openrouter)).
3. **Deletion must cascade to Blob.** Pillar 4's raw uploaded files may contain a client's
   confidential documents; a tenant-deletion must remove Blob objects, not just DB rows.
4. **No end-user notice.** Visitors are not told their chat is logged and sent to a third party.
5. **No data-residency choice.** Neon/Upstash/Blob region is unstated; EU clients will ask.

**Recommendation:** a deletion API keyed by `clientId` / `conversationId` / session; a subprocessor
list + DPA template; **pin the LLM provider to no-retention** (OpenAI ZDR where eligible, or
OpenRouter ZDR/data-policy filtering) and document it as the mechanism behind the brand promise;
region-pin the stores. **[Erasure + subprocessor disclosure are GA-blockers; the take-home should at
least state the LLM-provider data flow.]**

### G7 — Widget consent & cookie legality on third-party sites

Pillar 1 covers UI **accessibility** well (focus trap, `aria-live`, reduced-motion). It does **not**
cover the **legal** surface of dropping storage onto someone else's domain. The widget sets
`localStorage` on `acme.com`, and Pillar 2 wants an httpOnly cookie (which, per R3, is also broken
cross-site). On a third-party site this triggers **ePrivacy / cookie-consent** obligations *for the
client*, who will demand a consent-aware integration before embedding. There is no consent gate, no
config to defer storage until the host signals consent, and no privacy-policy link in the widget.

**Recommendation (Pillar 1):** a `data-consent`/`window.CadreChat.consent` gate that defers all
storage until the host grants it; a privacy-notice link in the panel; documented cookie/storage
disclosure for the client's own cookie policy; and, per R3, use a body `conversationId` from
localStorage rather than a cross-site cookie (which browsers block by default in Safari/Firefox and
gate in Chrome 2026 —
[cookie status 2026](https://cookie-script.com/news/new-future-of-cookies-user-choice-vs-browser-deprecation)).

### G8 — CI/CD, migrations, and preview-environment isolation

No pillar defines the actual delivery pipeline. Concretely missing:

- **A merge gate.** The repo mandates 80% coverage and eval-first, but nothing runs `pnpm test` +
  `pnpm eval` as a required check on PRs.
- **One migration mechanism** (R5) and **when** it runs: schema migrations should run as a
  **deploy/release step**, not silently at build time, with a documented rollback.
- **Preview isolation for *stateful* services.** Pillar 2 gets this half-right (Neon branch per
  PR), but **Redis and Blob have no per-preview namespace** — preview deployments would read/write
  **production** Upstash keys and Blob objects, cross-contaminating live client data and usage
  counters. Every stateful service needs a per-environment prefix/branch.

**Recommendation (Shared Infra + Pillar 2):** CI gate (tests + eval + typecheck + build) on every
PR; drizzle-kit migrations applied on deploy with rollback notes; Neon branch **and** a Redis key
prefix **and** a Blob path prefix keyed on the Vercel environment, so preview can never touch prod
state.

### G9 — Input safety: prompt-injection at scale and content moderation

Pillar 4 handles **document-borne** injection well (retrieved text framed as data; deterministic
gate upstream of the model). Two things remain uncovered:

- **No content moderation** on user input *or* model output. A public widget on a client's site can
  be steered to emit off-brand or unsafe content, or abused as a **free LLM proxy** for content
  unrelated to Cadre. The grounding/scope guardrail limits *topicality* but is not a *safety*
  filter.
- **Injection attempts aren't logged**, so abuse patterns are invisible (ties to G5).

**Recommendation (Pillar 1 as public-surface owner):** run OpenAI's **free moderation endpoint** on
input (and optionally output) as a cheap pre-filter; keep the deterministic scope guardrail as the
topicality gate; log flagged turns. Low cost, meaningful coverage.

### G10 — Health checks, SLA, uptime

There is no `/api/health` endpoint, no dependency probe (DB/Blob/Redis/LLM reachability), no uptime
monitor, and no stated availability target. The chat route degrades gracefully (good) but emits **no
external health signal**, so an outage of a *dependency* (e.g. Neon down, embeddings 401) is only
visible as a rise in escalations — which nobody is watching without G5.

**Recommendation (Observability workstream):** add `/api/health` (liveness + shallow dependency
checks), wire an uptime monitor to it and to Sentry alerting, and write down an SLO (even "best
effort, 99% monthly" is better than silence).

### G11 — Backups / disaster recovery

No pillar states a backup or restore policy. Neon provides **point-in-time recovery** out of the box,
but the plan must *choose a retention window and rehearse a restore*. Blob needs a redundancy/version
decision. Redis, if it remains the source of truth for usage (R1), needs a backup story — which is a
further argument for **not** making it the billing ledger; if it's only a cache, it's reconstructable
from Postgres and DR is trivial.

**Recommendation (Shared Infra):** verify/set Neon PITR retention and do one documented restore
drill; decide Blob redundancy; keep Redis reconstructable so it needs no backup.

---

## Recommended Data Layer & Shared Infra

### Data layer — resolve to a clear system-of-record + a disposable hot cache

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Neon Postgres (+ pgvector)  — THE SYSTEM OF RECORD (durable, backed up)    │
│                                                                            │
│  Pillar 2:  users, auth, conversations, messages,                          │
│             retrieval_traces, retrieval_chunks, answer_flags               │
│  Pillar 4:  document, document_version, chunk (halfvec 512, HNSW),         │
│             ingest_job                                                     │
│  Pillar 3:  usage_events (content-free), usage_rollup_daily/monthly,       │
│             budgets            ← MOVED here from Redis (billing ledger)     │
│  Tenancy:   clients (origin→clientId→config/budget/keys)  ← NEW (G3/R4)    │
│  ALL tenant-scoped tables carry client_id                                  │
└──────────────────────────────────────────────────────────────────────────┘
        ▲ joins for invoicing / per-conversation cost / GDPR deletion
        │
┌───────┴───────────────┐   ┌────────────────────────────────────────────────┐
│ Upstash Redis          │   │ Vercel Blob                                     │
│ (OPTIONAL hot cache)   │   │ raw uploaded file bytes (Pillar 4)              │
│ • rate-limit windows   │   │ • non-guessable keys, signed reads              │
│ • pre-request budget    │   │ • deletion cascades on tenant delete (G6)       │
│   counter (per req)    │   │ • per-env path prefix (G8)                      │
│ • alert NX latch       │   │ Object storage, not a database — genuinely a    │
│ RECONSTRUCTABLE from PG │   │ different job; keep it.                          │
└────────────────────────┘   └────────────────────────────────────────────────┘
```

**The decision:**

1. **Neon Postgres is the single system of record** for everything relational and durable —
   including **usage rollups and budgets**, which Pillar 3 wanted in Redis. Postgres does atomic
   counter updates fine (`INSERT … ON CONFLICT (…) DO UPDATE SET col = col + excluded.col`), and a
   billing ledger for a paying multi-client product must be durable, backed up, and **joinable to
   conversations** for invoicing and the per-conversation cost view. This also collapses R1 and
   makes G6 (tenant deletion) and G11 (backups) one story instead of three.

2. **Redis is optional and, if used, is only a disposable hot cache** for the two genuinely
   hot-path, high-write concerns — **rate-limit windows** (Pillar 1) and the **synchronous
   per-request budget pre-check** (Pillar 3) — plus the alert NX latch. It must be **reconstructable
   from Postgres** and never the source of truth. **At this product's scale (a low-QPS support bot),
   dropping Redis entirely and doing the budget pre-check + rate limit against Postgres is fully
   defensible** — an extra ~10–30 ms round-trip is noise next to a 2–5 s LLM call — and it is the
   most faithful reading of the "one justified external service" ethos. Recommendation: **start
   Postgres-only; add Redis only if measured hot-path latency or write contention justifies it.**

3. **Vercel Blob stays** — it is object storage, not a datastore, and putting 10 MB PDFs in Postgres
   rows would be the wrong tool. It is a genuinely distinct third dependency and that is fine.

So the coherent answer to "Redis alongside Postgres?" is: **not as a second database. Consolidate
the ledger into Postgres; Redis is at most a cache you could also live without.**

### Shared infra that needs an owner (no pillar has one)

These are cross-cutting and should be a small **Shared Infra / Platform** workstream rather than
bolted onto a random pillar: the **client/tenant registry** (G3/R4), **secrets & rotation** (G4),
**observability + health + alerting** (G5/G10), **CI/CD + migrations + preview isolation** (G8),
**backups/DR** (G11), and the **privacy/DPA/deletion** surface (G6). Nominate one owner for
`lib/config.ts` + `.env.example` (R5) so the env manifest stays coherent as pillars land.

---

## Go/No-Go Checklist for Production

Ordered blocker → high → medium. **Take-home reviewers:** none of these block the graded Tier-0/1
demo; they are the honest list of what a *real multi-client launch* requires, and several should be
stated as *declared cuts* in the take-home README rather than silently assumed built.

**Blockers (do not launch multi-client without these):**

- [ ] **G1/G2** Per-IP + per-client rate limit **live**, and an **enabled-by-default global daily
      spend cap** enforced pre-model. (Not a no-op seam.)
- [ ] **G3/R4** Tenant registry with **Origin→clientId binding**; `client_id` on
      documents/chunks/conversations/usage/budgets; retrieval filtered by tenant. (Or: **declare
      single-tenant** explicitly.)
- [ ] **G6** Right-to-erasure API (per tenant / conversation) with **Blob cascade**; subprocessor
      list + DPA; **LLM provider pinned to no-retention/no-train** (OpenAI ZDR or OpenRouter ZDR /
      data-policy filtering); region decision.
- [ ] **R2** Doc-management schema/interface collision resolved — **one** owner (Pillar 4), one
      table set, one flag, one migration tool, `halfvec(512)`.
- [ ] **R3** One conversation-identity scheme (**body UUID, client-namespaced**); Pillar 2's
      cross-site cookie removed.

**High (launch-week, not launch-day-optional):**

- [ ] **G4** Secret inventory + rotation runbook; per-environment secret scoping; per-client key
      decision.
- [ ] **G5** Sentry + structured event on every swallowed `catch` + rate-based alerting.
- [ ] **G7** Consent-deferred widget storage + privacy notice; documented for clients.
- [ ] **G8** CI merge gate (tests + eval); deploy-time migrations w/ rollback; **preview isolation
      for Redis + Blob**, not just Neon.

**Medium (fast-follow):**

- [ ] **G9** Moderation pass on input/output; log injection attempts.
- [ ] **G10** `/api/health` + uptime monitor + written SLO.
- [ ] **G11** Neon PITR retention set + one restore drill; Blob redundancy; Redis kept
      reconstructable.

---

## Explicit coverage statement

**Deployment-critical concerns still remain uncovered by the four pillars as written.** They are not
"polish" — several are structural and sit in the seams *between* pillars, which is exactly why no
single pillar caught them. Precisely, what is **not** adequately covered by any pillar today:

1. **Real abuse/DoS/cost-runaway protection that is on by default** (G1, G2) — the seams exist but
   ship as no-ops / default-off.
2. **Actual multi-tenant isolation and a trustworthy `clientId`** (G3, R4) — claimed, not built;
   `clientId` is forgeable and unbound to Origin; KB/config are single-tenant.
3. **Operational observability, health, and alerting** (G5, G10) — the system is designed to fail
   *silently*; no pillar owns Sentry/metrics/health.
4. **GDPR right-to-erasure, subprocessor disclosure, and LLM-provider data-flow pinning** (G6) —
   partial retention only; the "black-box your data" promise is unbacked until the LLM path is
   pinned to no-retention.
5. **Secret rotation and per-client keys** (G4) — assumed by Pillar 3, built by nobody.
6. **CI/CD, one migration story, and preview isolation for Redis/Blob** (G8) — undefined; preview
   would touch prod state.
7. **Widget consent/cookie legality on third-party origins** (G7) — and the related cross-site
   cookie **correctness** break (R3).
8. **A coherent single data layer** (R1) and **a de-duplicated doc-management ownership seam** (R2).

**Once G1–G11 and R1–R5 above are addressed — with a Shared-Infra/Tenancy workstream owning the
cross-cutting items — nothing deployment-critical remains uncovered.** Until then, the four pillars
compose into a strong *single-tenant, best-effort-observability* product, and any "multi-client,
budget-enforced, black-box-your-data" claim must be labeled advisory.

---

### Sources (version-sensitive claims)

- Next.js middleware auth-bypass **CVE-2025-29927** and the defense-in-depth response (already
  cited in Pillar 2): [Datadog Security Labs](https://securitylabs.datadoghq.com/articles/nextjs-middleware-auth-bypass/),
  [Picus](https://www.picussecurity.com/resource/blog/cve-2025-29927-nextjs-middleware-bypass-vulnerability).
- Third-party cookie status 2026 / `SameSite=None; Secure` requirement:
  [cookie-script — user choice vs deprecation](https://cookie-script.com/news/new-future-of-cookies-user-choice-vs-browser-deprecation),
  [Usercentrics — Google's changing approach](https://usercentrics.com/knowledge-hub/google-third-party-cookies/),
  [GoogleChromeLabs samesite-examples](https://github.com/GoogleChromeLabs/samesite-examples).
- OpenAI API data controls / retention / ZDR:
  [OpenAI — data controls](https://developers.openai.com/api/docs/guides/your-data),
  [OpenAI retention 2026 summary](https://meetily.ai/llm-privacy/openai).
- OpenRouter data policy / provider logging / ZDR controls:
  [OpenRouter — provider logging](https://openrouter.ai/docs/guides/privacy/provider-logging),
  [OpenRouter ZDR 2026 summary](https://meetily.ai/llm-privacy/openrouter).
- pgvector `halfvec` / HNSW at 512 dims (already cited in Pillars 2 & 4):
  [pgvector README](https://github.com/pgvector/pgvector),
  [Supabase HNSW docs](https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes).
</content>
</invoke>
