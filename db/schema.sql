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
