// Read-only repository for the KB-gap view (Phase 6). Surfaces the turns worth
// improving: escalated/weak retrieval, low top-score, or flagged — the durable
// "what the KB is missing" list. Row→read-model shaping lives in a pure mapper
// (mapGapRow) so it is unit-testable without a live DB (mirrors lib/admin/repos.ts).

import { getDb } from "../db";
import type { GapRow, GapRepo, Page } from "./contracts";

// Default top-score ceiling: a turn scoring below this is a candidate gap even
// when it wasn't escalated (mirrors the guardrail's weak-retrieval intuition).
const DEFAULT_MAX_SCORE = 0.35;

// ---------------------------------------------------------------------------
// Raw DB row shape (snake_case). Numeric columns are `number | string` because
// the pg driver returns float8/numeric as strings under some settings; the
// mapper coerces defensively. Timestamp is `Date | string` (porsager → Date).
// ---------------------------------------------------------------------------
export type GapQueryRow = {
  trace_id: string;
  message_id: string;
  conversation_id: string;
  query_text: string;
  mode: string;
  reason: string;
  top_score: number | string;
  coverage: number | string;
  created_at: Date | string;
  flagged: boolean;
};

// ---------------------------------------------------------------------------
// Pure mapper (no DB) — the tested seam.
// ---------------------------------------------------------------------------
function toIso(value: Date | string): string {
  return new Date(value).toISOString();
}

/** Row → GapRow: coerced numeric scores, ISO timestamp, boolean passthrough. */
export function mapGapRow(row: GapQueryRow): GapRow {
  return {
    traceId: row.trace_id,
    messageId: row.message_id,
    conversationId: row.conversation_id,
    queryText: row.query_text,
    mode: row.mode,
    reason: row.reason,
    topScore: Number(row.top_score),
    coverage: Number(row.coverage),
    createdAt: toIso(row.created_at),
    flagged: row.flagged, // passthrough — already a boolean from the driver
  };
}

// ---------------------------------------------------------------------------
// Repository implementation (read-only query).
// ---------------------------------------------------------------------------
async function gaps(f: {
  page: number;
  limit: number;
  maxScore?: number;
  clientId?: string;
}): Promise<Page<GapRow>> {
  const { page, limit, clientId } = f;
  const maxScore = f.maxScore ?? DEFAULT_MAX_SCORE;
  const sql = getDb();

  // A turn is a gap when it escalated, retrieval was weak, its top score fell
  // below the ceiling, or a reviewer flagged it. The flag EXISTS check appears
  // both in the predicate and (as a projected column) in the select list.
  const gapFilter = sql`
    t.mode = 'escalate'
    or t.reason = 'weak_retrieval'
    or t.top_score < ${maxScore}
    or exists (select 1 from answer_flags fx where fx.message_id = t.message_id)
  `;

  // Tenant scoping. retrieval_traces/messages carry no client_id, so scope via an
  // EXISTS back to conversations (m.conversation_id is in scope). Absent clientId
  // → unscoped (All clients). The gapFilter is parenthesized before ANDing this
  // in, so the client predicate can't be swallowed by the gapFilter's ORs.
  const clientFilter = clientId
    ? sql`and exists (
        select 1 from conversations cc
        where cc.id = m.conversation_id and cc.client_id = ${clientId}
      )`
    : sql``;

  const countRows = await sql<{ total: number | string }[]>`
    select count(*) as total
    from retrieval_traces t
    join messages m on m.id = t.message_id
    where (${gapFilter}) ${clientFilter}
  `;
  const total = Number(countRows[0]?.total ?? 0);

  const offset = (page - 1) * limit;
  const rows = await sql<GapQueryRow[]>`
    select
      t.id as trace_id,
      t.message_id,
      m.conversation_id,
      t.query_text,
      t.mode,
      t.reason,
      t.top_score,
      t.coverage,
      t.created_at,
      exists (select 1 from answer_flags f where f.message_id = t.message_id) as flagged
    from retrieval_traces t
    join messages m on m.id = t.message_id
    where (${gapFilter}) ${clientFilter}
    order by t.created_at desc
    limit ${limit} offset ${offset}
  `;

  return {
    rows: rows.map(mapGapRow),
    total,
    page,
    limit,
  };
}

/** Singleton repo — the app imports this; the interface pins the shape. */
export const gapRepo: GapRepo = { gaps };
