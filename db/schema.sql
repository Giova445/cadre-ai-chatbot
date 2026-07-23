-- Cadre AI KB — Supabase Postgres + pgvector schema.
-- Idempotent. Apply once against your Supabase project:
--   • Supabase Studio → SQL Editor → paste + Run, OR
--   • psql "$DATABASE_URL" -f db/schema.sql   (use the SESSION-mode / direct URL here)
-- Then seed the KB: pnpm ingest
--
-- Tenant-scoped from day one (client_id) so multi-tenancy layers on with no
-- migration; single-tenant deploys just use the 'default' client.

create extension if not exists vector;

-- Logical document — one per content/*.md source, per tenant.
create table if not exists documents (
  id              uuid primary key default gen_random_uuid(),
  client_id       text not null default 'default',
  source          text not null,                 -- e.g. "services.md"
  title           text not null default '',
  tags            text[] not null default '{}',
  current_version int  not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (client_id, source)
);

-- Ingest job audit (file-embedding pillar): status of a (re)embed run per source.
create table if not exists ingest_jobs (
  id         uuid primary key default gen_random_uuid(),
  client_id  text not null default 'default',
  source     text not null,
  status     text not null default 'pending',    -- pending | running | ready | error
  chunks     int  not null default 0,
  error      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Chunk + embedding. vector(512) matches EMBED_DIMENSIONS
-- (text-embedding-3-small, dimensions: 512). chunk_key is `${source}#${index}`,
-- unique within a tenant.
create table if not exists kb_chunks (
  client_id   text not null default 'default',
  chunk_key   text not null,
  document_id uuid references documents(id) on delete cascade,
  source      text not null,
  title       text not null default '',
  section     text not null default '',
  tags        text[] not null default '{}',
  text        text not null,
  embedding   vector(512) not null,
  version     int  not null default 1,
  created_at  timestamptz not null default now(),
  primary key (client_id, chunk_key)
);

create index if not exists kb_chunks_client_idx on kb_chunks (client_id);
-- Covering index for the documents FK (cascade deletes + joins).
create index if not exists kb_chunks_document_idx on kb_chunks (document_id);

-- Cosine ANN index. HNSW gives fast top-k; cheap to build at this doc count.
create index if not exists kb_chunks_embedding_idx
  on kb_chunks using hnsw (embedding vector_cosine_ops);

-- Secure by default. The app connects via the privileged Postgres role
-- (DATABASE_URL), which BYPASSES RLS, so retrieval + ingest keep working.
-- Enabling RLS with NO policies denies the anon/authenticated (PostgREST/public
-- API) roles entirely, so the KB is never exposed through the public REST API.
alter table documents   enable row level security;
alter table ingest_jobs enable row level security;
alter table kb_chunks   enable row level security;

-- ===========================================================================
-- Observability tables (admin dashboard, Phases 1-3). Applied via MCP migration
-- cadre_observability_schema. Best-effort turn logging writes here (lib/trace.ts);
-- the read-only admin dashboard reads it (lib/admin/repos.ts). Tenant-scoped.
-- ===========================================================================
create table if not exists conversations (
  id            uuid primary key default gen_random_uuid(),
  client_id     text not null default 'default',
  session_id    text not null,
  started_at    timestamptz not null default now(),
  last_at       timestamptz not null default now(),
  last_mode     text,
  message_count int  not null default 0,
  metadata      jsonb not null default '{}',
  unique (client_id, session_id)
);
create index if not exists conversations_last_at_idx on conversations (last_at desc);

create table if not exists messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  turn_index      int  not null,
  role            text not null,           -- user | assistant
  content         text not null,
  created_at      timestamptz not null default now()
);
create index if not exists messages_conversation_idx on messages (conversation_id, turn_index);

create table if not exists retrieval_traces (
  id             uuid primary key default gen_random_uuid(),
  message_id     uuid not null references messages(id) on delete cascade,
  query_text     text not null,
  mode           text not null,
  reason         text not null,
  top_score      double precision not null default 0,
  coverage       double precision not null default 0,
  threshold      double precision not null default 0,
  embedder_model text not null default '',
  backend        text not null default 'bundle',
  created_at     timestamptz not null default now()
);
create index if not exists retrieval_traces_message_idx on retrieval_traces (message_id);

create table if not exists retrieval_chunks (
  id        uuid primary key default gen_random_uuid(),
  trace_id  uuid not null references retrieval_traces(id) on delete cascade,
  chunk_id  text not null,
  source    text not null,
  section   text not null default '',
  title     text not null default '',
  tags      text[] not null default '{}',
  score     double precision not null,
  rank      int not null,
  cited     boolean not null default false
);
create index if not exists retrieval_chunks_trace_idx on retrieval_chunks (trace_id);

alter table conversations    enable row level security;
alter table messages         enable row level security;
alter table retrieval_traces enable row level security;
alter table retrieval_chunks enable row level security;

-- Phase 4: bad-answer flags (review queue). Applied via MCP migration
-- cadre_answer_flags. No users table (single-admin gate) → no reviewer_id.
create table if not exists answer_flags (
  id          uuid primary key default gen_random_uuid(),
  client_id   text not null default 'default',
  message_id  uuid not null references messages(id) on delete cascade,
  category    text not null,  -- hallucination|wrong_source|missed_escalation|tone|incomplete|other
  note        text not null default '',
  status      text not null default 'open',  -- open|triaged|resolved|wontfix
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists answer_flags_status_idx  on answer_flags (status, created_at desc);
create index if not exists answer_flags_message_idx on answer_flags (message_id);
alter table answer_flags enable row level security;

-- Rollout § B: client-scoped conversation list (applied via MCP migration
-- cadre_conversations_client_index).
create index if not exists conversations_client_last_at_idx
  on conversations (client_id, last_at desc);

-- Rollout § C: maker-configurable starter questions (DB tier). Applied via MCP
-- migration cadre_starter_questions. Tenant-scoped, RLS-secure like the rest.
create table if not exists starter_questions (
  id         uuid primary key default gen_random_uuid(),
  client_id  text not null default 'default',
  position   int  not null default 0,
  text       text not null,
  enabled    boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, position)
);
create index if not exists starter_questions_client_idx on starter_questions (client_id, position);
alter table starter_questions enable row level security;

-- Usage & cost tracking (applied via MCP migration cadre_usage_tracking). One row
-- per billable model call; content-free (tokens + cost only). Integer nano-USD.
create table if not exists usage_events (
  id                  uuid primary key default gen_random_uuid(),
  ts                  timestamptz not null default now(),
  client_id           text not null default 'default',
  conversation_id     text,
  kind                text not null,            -- 'chat' | 'embedding'
  operation           text not null default 'query', -- 'query' | 'ingest'
  provider            text not null default 'openai',
  model               text not null,
  input_tokens        int  not null default 0,
  output_tokens       int  not null default 0,
  cached_input_tokens int  not null default 0,
  cost_nano_usd       bigint not null default 0,
  cost_source         text not null default 'table_estimated',
  created_at          timestamptz not null default now()
);
create index if not exists usage_events_client_ts_idx  on usage_events (client_id, ts desc);
create index if not exists usage_events_conv_idx        on usage_events (conversation_id);
create index if not exists usage_events_client_kind_idx on usage_events (client_id, kind, ts desc);
alter table usage_events enable row level security;

create table if not exists usage_budgets (
  scope                    text not null,        -- 'global' | 'client'
  client_id                text not null default '',
  monthly_ceiling_nano_usd bigint not null default 0,
  warn_pct                 int  not null default 80,
  soft_block               boolean not null default false,
  updated_at               timestamptz not null default now(),
  primary key (scope, client_id)
);
alter table usage_budgets enable row level security;
