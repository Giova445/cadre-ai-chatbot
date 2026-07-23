// Read-only repositories for the admin dashboard (Phase 3). Every query here is
// SELECT-only; nothing in this module mutates the DB. Ranking/shaping lives in
// pure mapper helpers (mapConversationRow / mapTraceRow) so the row→read-model
// contract is unit-testable without a live connection (mirrors the pattern in
// lib/retrieval-pgvector.ts).

import { getDb } from "../db";
import { clientFilter, sessionFilter } from "./filters";
import type {
  ConversationDetail,
  ConversationRepo,
  ConversationSummary,
  DecisionMode,
  MessageRow,
  Page,
  TraceChunkRow,
  TraceRow,
} from "./contracts";

// ---------------------------------------------------------------------------
// Raw DB row shapes (snake_case). Numeric columns are typed `number | string`
// because the pg driver returns some numeric types as strings; the mappers
// coerce defensively. Timestamps are `Date | string` (porsager returns Date;
// fixtures may pass ISO strings) and normalize through `new Date().toISOString()`.
// ---------------------------------------------------------------------------
export type ConversationListRow = {
  id: string;
  client_id: string;
  session_id: string;
  started_at: Date | string;
  last_at: Date | string;
  last_mode: string | null;
  message_count: number | string;
  first_question: string | null;
};

export type TraceQueryRow = {
  id: string;
  message_id: string;
  query_text: string;
  mode: string;
  reason: string;
  top_score: number | string;
  coverage: number | string;
  threshold: number | string;
  embedder_model: string;
  backend: string;
  created_at: Date | string;
};

export type TraceChunkQueryRow = {
  trace_id: string;
  chunk_id: string;
  source: string;
  section: string;
  title: string;
  tags: string[] | null;
  score: number | string;
  rank: number | string;
  cited: boolean;
};

type MessageQueryRow = {
  id: string;
  turn_index: number | string;
  role: "user" | "assistant";
  content: string;
  created_at: Date | string;
};

// ---------------------------------------------------------------------------
// Pure mappers (no DB) — the tested seam.
// ---------------------------------------------------------------------------
function toIso(value: Date | string): string {
  return new Date(value).toISOString();
}

/** Row → ConversationSummary: ISO timestamps, coerced count, null-safe fields. */
export function mapConversationRow(row: ConversationListRow): ConversationSummary {
  return {
    id: row.id,
    clientId: row.client_id,
    sessionId: row.session_id,
    startedAt: toIso(row.started_at),
    lastAt: toIso(row.last_at),
    lastMode: row.last_mode,
    messageCount: Number(row.message_count),
    firstQuestion: row.first_question ?? "",
  };
}

function mapTraceChunkRow(c: TraceChunkQueryRow): TraceChunkRow {
  return {
    chunkId: c.chunk_id,
    source: c.source,
    section: c.section,
    title: c.title,
    tags: c.tags ?? [],
    score: Number(c.score),
    rank: Number(c.rank),
    cited: c.cited, // passthrough — already a boolean from the driver
  };
}

/**
 * Trace row + its chunk rows → TraceRow. Chunks are re-sorted by rank ascending
 * (independent of DB ordering, so the mapper is self-contained) and numeric
 * columns are coerced. Does not mutate the input array.
 */
export function mapTraceRow(
  traceRow: TraceQueryRow,
  chunkRows: readonly TraceChunkQueryRow[],
): TraceRow {
  const chunks = [...chunkRows]
    .sort((a, b) => Number(a.rank) - Number(b.rank))
    .map(mapTraceChunkRow);
  return {
    id: traceRow.id,
    messageId: traceRow.message_id,
    queryText: traceRow.query_text,
    mode: traceRow.mode,
    reason: traceRow.reason,
    topScore: Number(traceRow.top_score),
    coverage: Number(traceRow.coverage),
    threshold: Number(traceRow.threshold),
    embedderModel: traceRow.embedder_model,
    backend: traceRow.backend,
    createdAt: toIso(traceRow.created_at),
    chunks,
  };
}

function mapMessageRow(m: MessageQueryRow): MessageRow {
  return {
    id: m.id,
    turnIndex: Number(m.turn_index),
    role: m.role,
    content: m.content,
    createdAt: toIso(m.created_at),
  };
}

/** Group chunk rows by their trace_id (local accumulator; inputs untouched). */
function groupChunksByTrace(
  rows: readonly TraceChunkQueryRow[],
): Map<string, TraceChunkQueryRow[]> {
  const byTrace = new Map<string, TraceChunkQueryRow[]>();
  for (const row of rows) {
    const existing = byTrace.get(row.trace_id);
    if (existing) existing.push(row);
    else byTrace.set(row.trace_id, [row]);
  }
  return byTrace;
}

// ---------------------------------------------------------------------------
// Repository implementation (read-only queries).
// ---------------------------------------------------------------------------
async function list(f: {
  page: number;
  limit: number;
  mode?: DecisionMode;
  clientId?: string;
  sessionId?: string;
}): Promise<Page<ConversationSummary>> {
  const { page, limit, mode, clientId, sessionId } = f;
  const sql = getDb();

  // Composable fragments (each empty when its arg is absent). An absent
  // `clientId` means the "All clients" view — unscoped across every tenant —
  // NOT the "default" tenant; a concrete id scopes to that tenant. `sessionId`
  // deep-links to one browser session's history (the per-user view). Unqualified
  // columns resolve to the conversations row in both the count and list queries.
  const cFilter = clientFilter(sql, clientId);
  const sFilter = sessionFilter(sql, sessionId);
  const modeFilter = mode ? sql`and last_mode = ${mode}` : sql``;

  const countRows = await sql<{ total: number | string }[]>`
    select count(*) as total
    from conversations
    where true ${cFilter} ${sFilter} ${modeFilter}
  `;
  const total = Number(countRows[0]?.total ?? 0);

  const offset = (page - 1) * limit;
  const rows = await sql<ConversationListRow[]>`
    select
      c.id,
      c.client_id,
      c.session_id,
      c.started_at,
      c.last_at,
      c.last_mode,
      c.message_count,
      (
        select content from messages m
        where m.conversation_id = c.id and m.role = 'user'
        order by m.turn_index asc
        limit 1
      ) as first_question
    from conversations c
    where true ${cFilter} ${sFilter} ${modeFilter}
    order by c.last_at desc
    limit ${limit} offset ${offset}
  `;

  return {
    rows: rows.map(mapConversationRow),
    total,
    page,
    limit,
  };
}

async function getDetail(
  id: string,
  opts?: { clientId?: string },
): Promise<ConversationDetail | null> {
  const sql = getDb();

  // When opts.clientId is set, the fetch is scoped by client_id so a crafted id
  // from another tenant returns null (not found) rather than crossing tenants.
  // When absent (the "All clients" view), the conversation is fetched across any
  // tenant, as before.
  const cFilter = clientFilter(sql, opts?.clientId);
  const convRows = await sql<ConversationListRow[]>`
    select
      id,
      client_id,
      session_id,
      started_at,
      last_at,
      last_mode,
      message_count,
      (
        select content from messages m
        where m.conversation_id = conversations.id and m.role = 'user'
        order by m.turn_index asc
        limit 1
      ) as first_question
    from conversations
    where id = ${id} ${cFilter}
    limit 1
  `;
  const convRow = convRows[0];
  if (!convRow) return null;

  // messages (all), traces (assistant messages only), and their chunks. Chunks
  // are fetched with a correlated subquery on the same assistant-message set,
  // so there is no dependency on a JS-passed id array (empty-set safe) and it
  // stays a single read. Grouping + rank ordering happen in the mappers.
  const [messageRows, traceRows, chunkRows] = await Promise.all([
    sql<MessageQueryRow[]>`
      select id, turn_index, role, content, created_at
      from messages
      where conversation_id = ${id}
      order by turn_index asc
    `,
    sql<TraceQueryRow[]>`
      select
        t.id,
        t.message_id,
        t.query_text,
        t.mode,
        t.reason,
        t.top_score,
        t.coverage,
        t.threshold,
        t.embedder_model,
        t.backend,
        t.created_at
      from retrieval_traces t
      join messages m on m.id = t.message_id
      where m.conversation_id = ${id} and m.role = 'assistant'
      order by m.turn_index asc
    `,
    sql<TraceChunkQueryRow[]>`
      select
        c.trace_id,
        c.chunk_id,
        c.source,
        c.section,
        c.title,
        c.tags,
        c.score,
        c.rank,
        c.cited
      from retrieval_chunks c
      where c.trace_id in (
        select t.id
        from retrieval_traces t
        join messages m on m.id = t.message_id
        where m.conversation_id = ${id} and m.role = 'assistant'
      )
      order by c.rank asc
    `,
  ]);

  const chunksByTrace = groupChunksByTrace(chunkRows);
  const traces: Record<string, TraceRow> = Object.fromEntries(
    traceRows.map((t) => {
      const mapped = mapTraceRow(t, chunksByTrace.get(t.id) ?? []);
      return [mapped.messageId, mapped] as const;
    }),
  );

  return {
    conversation: mapConversationRow(convRow),
    messages: messageRows.map(mapMessageRow),
    traces,
  };
}

/** Singleton repo — the app imports this; the interface pins the shape. */
export const conversationRepo: ConversationRepo = { list, getDetail };
