# Graph Report - .  (2026-07-24)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1339 nodes · 2378 edges · 85 communities (77 shown, 8 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 53 edges (avg confidence: 0.52)
- Token cost: 4,728 input · 784 output

## Graph Freshness
- Built from commit: `4b0e3d9e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Budget Management
- Embed Panel Components
- Widget Host Configuration
- URL Fetching and Validation
- Admin Navigation
- Client API Operations
- AI Chatbot Architecture
- TypeScript Configuration
- System Coverage and Gaps
- Data Ingestion and Retrieval
- Architecture and Design
- Current State Analysis
- Data Model and Interfaces
- Coverage and Reconciliation
- Authentication Management
- Chat API Operations
- Data Processing Pipeline
- Project Planning and Milestones
- Job Management UI
- Crawl Job Management
- Conversation Data Management
- User Interface Components
- Delivery and Isolation
- Conversation Repository
- Chat Health Management
- User and Client Review
- Dependencies and Libraries
- Status Indicators
- Chat Data Processing
- Flag Management
- Test Case Management
- Flag Repository Operations
- Content Chunking
- Embedding and Tokenization
- Retrieval Guardrails
- Retrieval Trace Management
- Crawl Job Management
- Development Dependencies
- AI Chatbot Development Plan
- Starter Management
- Web Page Extraction
- AI Chatbot Overview
- Page Status Management
- Retrieval Decision Making
- Conversation Table UI
- Design Trade-offs
- Data Ingestion Management
- Build Scripts
- Conversation Detail UI
- Drain Request Management
- Project Architecture Overview
- Crawl Job Table UI
- FAQ and Escalation
- Sitemap Job Management
- Design Trade-offs Analysis
- Job Handling
- AI Services Overview
- Build Status and Planning
- PostgreSQL Retrieval
- Package Configuration
- App Layout Configuration
- AI Maturity Index
- Client Engagement Guide
- Client Portal Overview
- Data Security Governance
- Company Overview
- Deployment Gaps Analysis
- Industry Overview
- Widget Embed Panel Overview
- Build Status Verification
- Usage Probing
- Next.js Configuration
- OpenAI SDK
- Linkedom Library
- Supabase Configuration
- Next.js Framework
- Markdown Processing
- Vercel Configuration

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 48 edges
2. `requireAdmin()` - 34 edges
3. `POST()` - 20 edges
4. `compilerOptions` - 17 edges
5. `Retrieved` - 14 edges
6. `Cadre AI Support Chatbot — System Architecture` - 14 edges
7. `formatUsd()` - 13 edges
8. `assertUrlAllowed()` - 13 edges
9. `Cadre AI Support Chatbot` - 13 edges
10. `Architecture` - 13 edges

## Surprising Connections (you probably didn't know these)
- `ConversationDetailPage()` --calls--> `requireAdmin()`  [EXTRACTED]
  app/admin/(protected)/conversations/[id]/page.tsx → lib/admin/auth.ts
- `groupFlagsByMessage()` --indirect_call--> `row()`  [INFERRED]
  lib/admin/flag-repo.ts → tests/starter-repo.test.ts
- `groupChunksByTrace()` --indirect_call--> `row()`  [INFERRED]
  lib/admin/repos.ts → tests/starter-repo.test.ts
- `rankChunks()` --indirect_call--> `chunk()`  [INFERRED]
  lib/retrieval.ts → tests/guardrail-coverage.test.ts
- `ConversationsPage()` --calls--> `requireAdmin()`  [EXTRACTED]
  app/admin/(protected)/conversations/page.tsx → lib/admin/auth.ts

## Import Cycles
- None detected.

## Communities (85 total, 8 thin omitted)

### Community 0 - "Budget Management"
Cohesion: 0.05
Nodes (77): BalanceCard(), BudgetEditor(), findBudget(), BudgetStatusBadge(), CLASS_BY_STATUS, DisplayBudgetStatus, LABELS, UsageByModelTable() (+69 more)

### Community 1 - "Embed Panel Components"
Cohesion: 0.08
Nodes (42): CopyButton(), EmbedPanel(), ModeId, MODES, PositionId, POSITIONS, EmbedPreview(), positionLabel() (+34 more)

### Community 2 - "Widget Host Configuration"
Cohesion: 0.08
Nodes (37): WidgetConfig, applyStyles(), mountHost(), resolveInlineContainer(), supportsAdoptedStyleSheets(), WidgetHost, createChatIcon(), createCloseIcon() (+29 more)

### Community 3 - "URL Fetching and Validation"
Cohesion: 0.11
Nodes (34): BodySchema, POST(), RFC-1918, RFC-9309, fetchPage(), FetchPageResult, headerNoindex(), HTML_TYPES (+26 more)

### Community 4 - "Admin Navigation"
Cohesion: 0.08
Nodes (24): AdminNav(), NAV_ITEMS, NavItem, ClientSelector(), LogoutIcon(), NavIcon, LogoutButton(), EmbedPage() (+16 more)

### Community 5 - "Client API Operations"
Cohesion: 0.09
Nodes (24): OPTIONS(), clientSchema, GET(), OPTIONS(), resolveClientParam(), StarterRepo, create(), list() (+16 more)

### Community 6 - "AI Chatbot Architecture"
Cohesion: 0.06
Nodes (36): 10. Failure modes, 11.1 Environment layout, 11.2 Input and injection posture, 11. Security and secrets, 12. Assumptions, 13. Traceability to the contract, 1.1 What this is, 1.2 Quality attributes (what "good" means here) (+28 more)

### Community 7 - "TypeScript Configuration"
Cohesion: 0.07
Nodes (27): dom, dom.iterable, ES2022, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts, **/*.tsx (+19 more)

### Community 8 - "System Coverage and Gaps"
Cohesion: 0.07
Nodes (27): Critical Gaps, Cross-Pillar Reconciliation, Data layer — resolve to a clear system-of-record + a disposable hot cache, Deployment Gaps & Production Readiness, Explicit coverage statement, Final Coverage Verdict (post-Pillar-6), G10 — Health checks, SLA, uptime, G11 — Backups / disaster recovery (+19 more)

### Community 9 - "Data Ingestion and Retrieval"
Cohesion: 0.07
Nodes (27): 1. Pipeline components, 2. Data model, 3.1 Ingestion (write path — async, admin-triggered), 3.2 Retrieval (read path — per chat turn, synchronous, contract-frozen), 3. Data flow, 4. Vector-store choice, 5. Live vs stale doc view, 6. Security (+19 more)

### Community 10 - "Architecture and Design"
Cohesion: 0.07
Nodes (27): Alerting design, Architecture, Components, Cost-calculation design, Data flow + diagram, Data model — budgets, Data model — usage events, Dependencies (+19 more)

### Community 11 - "Current State Analysis"
Cohesion: 0.08
Nodes (26): 1. Where we are today (the starting point), 2. Components, 3. Data model, 4. Interfaces (frozen seams), 5. Data flow, 6.1 Persistence store — **Neon (serverless Postgres) + pgvector**, 6.2 Data access — **Drizzle ORM + drizzle-kit migrations**, 6.3 Observability tooling — **build the minimal trace store; do not add Langfuse yet** (+18 more)

### Community 12 - "Data Model and Interfaces"
Cohesion: 0.08
Nodes (25): 0. Interpretation and ambiguity (read first), 1. Where we are today (the starting point), 2. Where a maker's questions live (the core decision), 3. One definition, two renderers (source of truth), 4.1 Data model, 4.2 Interfaces (frozen seams), 4.3 The public config endpoint (how DB starters reach the widget), 4.4 Admin editor (+17 more)

### Community 13 - "Coverage and Reconciliation"
Cohesion: 0.08
Nodes (25): Closing statement, Coverage Matrix, Cross-Pillar Reconciliation (R1–R5), G10 — Health checks / SLA / uptime, G11 — Backups / disaster recovery, G1 — Public unauthenticated money-spending endpoint: real abuse controls, on at launch, G2 — Cost-runaway / DoS: an enabled-by-default global daily spend cap, enforced pre-model, G3 — Multi-tenancy built, not just claimed: isolation of KB, config, budgets, logs (+17 more)

### Community 14 - "Authentication Management"
Cohesion: 0.15
Nodes (19): BASE_COOKIE, LoginSchema, POST(), ADMIN_COOKIE_MAX_AGE, base64UrlToBytes(), bytesToBase64Url(), createSessionToken(), decoder (+11 more)

### Community 15 - "Chat API Operations"
Cohesion: 0.16
Nodes (20): BodySchema, encoderStream(), iterableStream(), Meta, metaHeaders(), POST(), readOrCreateSid(), scheduleTurnLog() (+12 more)

### Community 16 - "Data Processing Pipeline"
Cohesion: 0.08
Nodes (24): 1. Pipeline components, 2.1 Discovery (synchronous, admin-triggered, fast), 2.2 Crawl + ingest (asynchronous, bounded per invocation, idempotent per page), 2. Data flow, 3. Data model, 4. HTML → text extraction — library choice, 5. robots.txt, noindex, empty & JS-rendered pages, 6. Serverless execution — bounded batch + durable job model (+16 more)

### Community 17 - "Project Planning and Milestones"
Cohesion: 0.08
Nodes (24): 0. How to read this plan, 10. Rough sequencing / estimate (slice-by-slice), 1. Milestones (strict order — honor the tier gate), 2.1 `content/*.md` — Knowledge base (KB agent), 2.2 `scripts/embed.ts` — build-time ingest (embed/pipeline agent), 2.3 `lib/retrieval.ts` — cosine top-k (retrieval agent), 2.4 `lib/llm.ts` — provider adapter (retrieval/LLM agent), 2.5 `lib/prompt.ts` — persona + grounding + guardrails (prompt agent) (+16 more)

### Community 18 - "Job Management UI"
Cohesion: 0.13
Nodes (14): DrainJobButton(), DrainResponse, EmptyState(), base, EmptyIcon, ForwardIcon(), IconProps, PlayIcon() (+6 more)

### Community 19 - "Crawl Job Management"
Cohesion: 0.09
Nodes (23): 10. Build and hosting, 11. Rejected alternatives (carried forward, still valid), 1. Where we are today, 2. Components, 3. Delivery: `<script>` loader (default) vs `<iframe>` (fallback), 4. Isolation: Shadow DOM, 5. Config and theming (frozen interface), 6. Transport and data flow (+15 more)

### Community 20 - "Conversation Data Management"
Cohesion: 0.17
Nodes (17): clientFilter(), sessionFilter(), Sql, ConversationListRow, getDetail(), groupChunksByTrace(), list(), mapConversationRow() (+9 more)

### Community 21 - "User Interface Components"
Cohesion: 0.10
Nodes (21): 10. Rejected alternatives, 1. Where we are today (the current-state delta), 2. The screen, precisely, 3. The launcher toggle: `mode="launcher"` vs `mode="inline"` (the one widget addition), 4. Snippet generation (the core, pure function), 5. Live preview (real bundle, real theme, before copy), 6. Client id source (the second reconciliation detail), 7. Interfaces (frozen seams) (+13 more)

### Community 22 - "Delivery and Isolation"
Cohesion: 0.10
Nodes (21): 10. Rejected alternatives and tradeoffs, 1. Goal and constraints, 2. Components, 3. Delivery: `<script>` loader (recommended) vs `<iframe>`, 4. Isolation: Shadow DOM details and tradeoffs, 5. Config and theming, 6. Transport and data flow, 7. Security (+13 more)

### Community 23 - "Conversation Repository"
Cohesion: 0.13
Nodes (13): ConversationDetail, ConversationRepo, GapRepo, GapRow, LogTurnInput, Page, TraceChunkRow, GapQueryRow (+5 more)

### Community 24 - "Chat Health Management"
Cohesion: 0.18
Nodes (15): GET(), HAS_CHAT_KEY, USING_REAL_EMBEDDINGS, getKB(), KB, retrieve(), retrieveText(), retrieveTextWithUsage() (+7 more)

### Community 25 - "User and Client Review"
Cohesion: 0.10
Nodes (20): 1. Where we are today (the current-state delta), 2. The three dimensions, precisely, 3. The core change: `client_id` end to end, 4. Components (small, focused, mostly edits to existing files), 5. Data model (reuse the existing tables), 6. Interfaces (frozen seams — repo + registry additions), 7. Security, 8. UI (+12 more)

### Community 26 - "Dependencies and Libraries"
Cohesion: 0.11
Nodes (19): ai, gray-matter, @mozilla/readability, dependencies, ai, gray-matter, @mozilla/readability, @phosphor-icons/react (+11 more)

### Community 27 - "Status Indicators"
Cohesion: 0.17
Nodes (16): CATEGORY_LABELS, FlagBadge(), STATUS_CLASS, STATUS_LABELS, StatusPill(), StatusControl(), DATE_FORMAT, hrefFor() (+8 more)

### Community 28 - "Chat Data Processing"
Cohesion: 0.19
Nodes (10): deriveChunkRows(), logTurn(), ChatRole, Chunk, ChunkMeta, EmbeddingsFile, GoldenExpect, Retrieved (+2 more)

### Community 29 - "Flag Management"
Cohesion: 0.20
Nodes (13): CATEGORY_SET, FlagForm(), isFlagCategory(), createFlagSchema, createStarterSchema, deleteStarterSchema, reorderStartersSchema, updateFlagStatusSchema (+5 more)

### Community 30 - "Test Case Management"
Cohesion: 0.20
Nodes (16): cases, includesCI(), main(), pad(), printTable(), Row, runCase(), Decision (+8 more)

### Community 31 - "Flag Repository Operations"
Cohesion: 0.17
Nodes (12): FlagRepo, FlagWithContext, create(), FlagContextRow, FlagQueryRow, forMessages(), groupFlagsByMessage(), mapFlagRow() (+4 more)

### Community 32 - "Content Chunking"
Cohesion: 0.19
Nodes (15): chunkMarkdown(), estTokens(), headingText(), isHeading(), RawChunk, Section, splitBody(), splitIntoBlocks() (+7 more)

### Community 33 - "Embedding and Tokenization"
Cohesion: 0.22
Nodes (16): computeIdf(), embedBatch(), embedBatchWithUsage(), embedQuery(), fnv1a(), lexicalEmbed(), rawTokens(), realEmbeddingProvider() (+8 more)

### Community 34 - "Retrieval Guardrails"
Cohesion: 0.11
Nodes (18): 1. Support scenarios (the golden set), 2. Scope, 3. Success criteria, 4. Non-goals, 5.10 `RETRIEVAL_THRESHOLD` — the single guardrail knob (`lib/config.ts`), 5.1 Core types (`lib/types.ts`), 5.2 Retrieval (`lib/retrieval.ts`) — pure, no I/O, 5.3 Bound KB (`lib/kb.ts`) (+10 more)

### Community 35 - "Retrieval Trace Management"
Cohesion: 0.18
Nodes (13): CLASS_BY_MODE, LABELS, ModeBadge(), pct(), RetrievalTracePanel(), ScoreBar(), DATE_FORMAT, GapsPage() (+5 more)

### Community 36 - "Crawl Job Management"
Cohesion: 0.22
Nodes (14): claimQueued(), CrawlJobRow, createJob(), getJob(), iso(), listJobs(), listPages(), mapJobRow() (+6 more)

### Community 37 - "Development Dependencies"
Cohesion: 0.13
Nodes (15): esbuild, devDependencies, esbuild, tsx, @types/node, @types/react, @types/react-dom, typescript (+7 more)

### Community 38 - "AI Chatbot Development Plan"
Cohesion: 0.13
Nodes (15): Architecture (modules + interfaces so the swarm can parallelize), Cadre AI Take-Home — Support Chatbot (Build Plan v2), Context, Engineering process — systematic, swarm-orchestrated (the core of this plan), Env / config, Golden set (write first — `evals/golden.json`), Interface contracts (lock before parallel build), Knowledge base design (+7 more)

### Community 39 - "Starter Management"
Cohesion: 0.30
Nodes (10): StarterEditor(), StarterRowItem(), QuestionsPage(), resolveClient(), requireAdmin(), StarterRow, createStarter(), deleteStarter() (+2 more)

### Community 40 - "Web Page Extraction"
Cohesion: 0.26
Nodes (10): contentHash(), CRAWL_TAGS, DrainResult, processPage(), extractHtml(), hasNoindexMeta(), htmlToMarkdown(), wordCount() (+2 more)

### Community 41 - "AI Chatbot Overview"
Cohesion: 0.14
Nodes (14): Architecture at a glance, Cadre AI Support Chatbot, Deploy to Vercel, Evals and tests, Offline vs online modes (the core), Quickstart, Scale thresholds — when I would change the design further, System map (+6 more)

### Community 42 - "Page Status Management"
Cohesion: 0.22
Nodes (10): CLASS_BY_STATUS, LABELS, PageStatusBadge(), formatTime(), PageStatusTable(), SKIP_REASON_LABELS, TIME_FORMAT, PageStatus (+2 more)

### Community 43 - "Retrieval Decision Making"
Cohesion: 0.29
Nodes (9): RETRIEVAL_THRESHOLD, coverage(), decide(), DecisionReason, UBIQUITOUS, cosineSimilarity(), dot(), isWeak() (+1 more)

### Community 44 - "Conversation Table UI"
Cohesion: 0.24
Nodes (10): ConversationTable(), formatTime(), TIME_FORMAT, truncate(), ConversationsPage(), hrefFor(), isDecisionMode(), MODE_FILTERS (+2 more)

### Community 45 - "Design Trade-offs"
Cohesion: 0.17
Nodes (12): DEC-1 — No vector database, DEC-2 — Offline deterministic lexical embedder as a keyless fallback, DEC-3 — Custom plain-text streaming protocol (not the AI SDK UI protocol), DEC-4 — Provider-agnostic seam, DEC-5 — Deterministic `decide()` shared by the route and the eval runner, DEC-6 — Mode-aware single guardrail knob, DEC-7 — Grounding-coverage guard (refuse when the context doesn't actually support the claim), DEC-8 — Manual "Process now" crawl-drain affordance, in addition to (not replacing) cron (+4 more)

### Community 46 - "Data Ingestion Management"
Cohesion: 0.27
Nodes (10): closeDb(), IngestResult, ingestSource, vectorLiteral(), activeEmbeddingModel(), recordUsage(), CONTENT_DIR, main() (+2 more)

### Community 47 - "Build Scripts"
Cohesion: 0.17
Nodes (12): scripts, build, build:widget, dev, embed, eval, ingest, prebuild (+4 more)

### Community 48 - "Conversation Detail UI"
Cohesion: 0.24
Nodes (8): BackIcon(), CrumbIcon(), preferReduced(), Reveal(), TranscriptTurn(), ConversationDetailPage(), DATE_FORMAT, MessageRow

### Community 49 - "Drain Request Management"
Cohesion: 0.33
Nodes (8): POST(), drain(), remainingQueued(), clampBatch(), DrainRequest, drainRequestSchema, DrainResponse, shouldStop()

### Community 50 - "Project Architecture Overview"
Cohesion: 0.20
Nodes (9): Architecture, Commands (verified), Guardrails (product behavior — these are requirements, not style), Process, Scope tiers (the graded judgment — respect the order), Serverless constraints that shaped the design, Stack (decided — deliberately lean; do not add infra), Status: Tier 0 built & tested (+1 more)

### Community 51 - "Crawl Job Table UI"
Cohesion: 0.28
Nodes (8): CrawlJobTable(), formatTime(), JOB_STATUS_CLASS, JOB_STATUS_LABELS, jobHref(), TIME_FORMAT, CrawlJob, CrawlJobStatus

### Community 53 - "FAQ and Escalation"
Cohesion: 0.22
Nodes (8): Frequently Asked Questions, How do I get started?, How Much Does It Cost?, Talking to a Human, What does Cadre AI do?, What services can I engage Cadre for?, When to Escalate, Which AI models do you work with?

### Community 55 - "Design Trade-offs Analysis"
Cohesion: 0.25
Nodes (8): 1. Brute-force cosine vs. a vector database, 2. Offline lexical embedder vs. requiring a real embeddings key, 3. No persistence in Tier 0, 4. Provider-agnostic seam vs. hardwiring one vendor, 5. Custom plain-text streaming protocol vs. the AI SDK UI protocol, 6. Deterministic guardrail vs. trusting the model to police itself, The through-line, TRADEOFFS.md — right-sizing the build

### Community 56 - "Job Handling"
Cohesion: 0.52
Nodes (6): GET(), handle(), POST(), presentedSecret(), secretsMatch(), oldestJobWithQueued()

### Community 58 - "AI Services Overview"
Cohesion: 0.29
Nodes (6): AI Agents, AI Engineering, AI Leadership and Facilitation, AI Strategy, An Integrated AI Team, How Onboarding Works: Find. Prepare. Implement.

### Community 59 - "Build Status and Planning"
Cohesion: 0.33
Nodes (6): Build status (this is a plan; nothing built yet), Completeness verification, Deliverable 1 — Widget embed panel (§ A), Deliverable 2 — Sitemap → embeddings pipeline (§ B), Recommended build order, References (internal)

### Community 60 - "PostgreSQL Retrieval"
Cohesion: 0.67
Nodes (4): PgChunkRow, retrievePgvector(), rowToRetrieved(), vectorLiteral()

### Community 61 - "Package Configuration"
Cohesion: 0.33
Nodes (5): engines, node, name, private, version

### Community 62 - "App Layout Configuration"
Cohesion: 0.40
Nodes (3): inter, interTight, metadata

### Community 63 - "AI Maturity Index"
Cohesion: 0.40
Nodes (4): Start Free: The Cadre 360 AI Assessment, The Eight Pillars, Turning the Score Into a Plan, What the AI Maturity Index Is

### Community 64 - "Client Engagement Guide"
Cohesion: 0.40
Nodes (4): How to Reach Us, Start Free Before You Commit, Talk to an AI Strategist, What to Expect

### Community 65 - "Client Portal Overview"
Cohesion: 0.40
Nodes (4): For Existing Clients, Requesting Access, The Cadre Client Portal, What the Portal Tracks

### Community 66 - "Data Security Governance"
Cohesion: 0.40
Nodes (4): Governance That Enables, Not Blocks, How We Approach Your Data, Model-Agnostic by Design, The AI Command Center

### Community 67 - "Company Overview"
Cohesion: 0.40
Nodes (4): Our Mission and Positioning, The Cadre Way, Who Runs Cadre, Who We Are

### Community 68 - "Deployment Gaps Analysis"
Cohesion: 0.40
Nodes (5): Client-Rollout Features — the four deployment gaps, Consolidated build order, "Maker questions" — interpretation (you asked to confirm), The cross-cutting foundation (why the three sections rhyme), The four gaps → the three plan sections

### Community 69 - "Industry Overview"
Cohesion: 0.50
Nodes (3): How We Organize Work by Department, Industries We Work With, Outcomes Over Hype

### Community 70 - "Widget Embed Panel Overview"
Cohesion: 0.50
Nodes (4): Admin: Widget Embed Panel + Sitemap → Embeddings Pipeline, Key decisions (stated up front), Reconciliation with as-built (both deliverables), The two deliverables → the two sections

### Community 71 - "Build Status Verification"
Cohesion: 0.50
Nodes (4): Build status snapshot (plan vs shipped), Completeness verification, Recommended next step, References (internal)

### Community 72 - "Usage Probing"
Cohesion: 0.83
Nodes (3): j(), main(), rest()

## Knowledge Gaps
- **550 isolated node(s):** `supabase`, `DATE_FORMAT`, `MODE_FILTERS`, `metadata`, `DATE_FORMAT` (+545 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getDb()` connect `Budget Management` to `Admin Navigation`, `Client API Operations`, `Crawl Job Management`, `Web Page Extraction`, `Chat Data Processing`, `Data Ingestion Management`, `Drain Request Management`, `Conversation Data Management`, `Conversation Repository`, `Job Handling`, `PostgreSQL Retrieval`, `Flag Repository Operations`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Why does `requireAdmin()` connect `Starter Management` to `Budget Management`, `Retrieval Trace Management`, `Admin Navigation`, `URL Fetching and Validation`, `Conversation Table UI`, `Authentication Management`, `Conversation Detail UI`, `Drain Request Management`, `Job Management UI`, `Status Indicators`, `Flag Management`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `IMPLEMENTATION_PLAN.md — Cadre AI Support Chatbot` connect `Project Planning and Milestones` to `Project Documentation`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `supabase`, `DATE_FORMAT`, `MODE_FILTERS` to the rest of the system?**
  _550 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Budget Management` be split into smaller, more focused modules?**
  _Cohesion score 0.05029890744176459 - nodes in this community are weakly interconnected._
- **Should `Embed Panel Components` be split into smaller, more focused modules?**
  _Cohesion score 0.07982583454281568 - nodes in this community are weakly interconnected._
- **Should `Widget Host Configuration` be split into smaller, more focused modules?**
  _Cohesion score 0.07653061224489796 - nodes in this community are weakly interconnected._