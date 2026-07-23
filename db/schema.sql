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
