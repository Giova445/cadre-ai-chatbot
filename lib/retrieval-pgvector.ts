// pgvector retrieval backend. Ranking happens IN Postgres (cosine `<=>` + HNSW),
// so this returns the same `Retrieved[]` contract as the in-memory core — the
// route/guardrail/prompt code is identical regardless of backend.
//
// pgvector is REAL-embeddings only (see lib/kb.ts): the DB is seeded (pnpm ingest)
// with text-embedding-3-small vectors, and the query is embedded the same way, so
// query and chunk embedders always match.

import type { Retrieved } from "./types";
import { TOP_K } from "./config";
import { getDb } from "./db";

const DEFAULT_CLIENT_ID = "default";

// pgvector accepts a vector as the text literal "[a,b,c]" cast with ::vector.
export function vectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

export type PgChunkRow = {
  id: string;
  source: string;
  title: string;
  section: string;
  tags: string[] | null;
  text: string;
  score: number | string;
};

// Pure DB-row → Retrieved mapping (tested without a live DB). Embedding is NOT
// selected (large, unused downstream); tags NULL coalesces to []; score (float8
// or numeric-as-string) coerces to a number.
export function rowToRetrieved(r: PgChunkRow): Retrieved {
  return {
    chunk: {
      id: r.id,
      text: r.text,
      embedding: [],
      meta: {
        source: r.source,
        title: r.title,
        section: r.section,
        tags: r.tags ?? [],
      },
    },
    score: Number(r.score),
  };
}

/**
 * Top-k chunks for a query vector, scored by cosine similarity (1 - distance),
 * scoped to a tenant. Mirrors rankChunks() but delegates ranking to pgvector.
 */
export async function retrievePgvector(
  queryVec: number[],
  k: number = TOP_K,
  clientId: string = DEFAULT_CLIENT_ID,
): Promise<Retrieved[]> {
  const sql = getDb();
  const lit = vectorLiteral(queryVec);
  const rows = await sql<PgChunkRow[]>`
    select
      chunk_key as id,
      source,
      title,
      section,
      tags,
      text,
      1 - (embedding <=> ${lit}::vector) as score
    from kb_chunks
    where client_id = ${clientId}
    order by embedding <=> ${lit}::vector
    limit ${k}
  `;
  return rows.map(rowToRetrieved);
}
