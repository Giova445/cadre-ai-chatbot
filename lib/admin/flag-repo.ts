// Read/write repository for bad-answer flags + the review queue (Phase 4). Unlike
// lib/admin/repos.ts (read-only), this module also INSERTs/UPDATEs the answer_flags
// table. Ranking/shaping still lives in pure mapper helpers (mapFlagRow /
// mapFlagWithContext) so the row→read-model contract is unit-testable without a
// live connection (mirrors lib/admin/repos.ts and lib/retrieval-pgvector.ts).

import { getDb } from "../db";
import type {
  FlagCategory,
  FlagRow,
  FlagStatus,
  FlagWithContext,
  FlagRepo,
  Page,
} from "./contracts";

const DEFAULT_CLIENT_ID = "default";

// ---------------------------------------------------------------------------
// Raw DB row shapes (snake_case). Timestamps are `Date | string` (porsager
// returns Date; fixtures may pass ISO strings) and normalize through toIso.
// category/status pass straight through as their enum types (DB text columns).
// ---------------------------------------------------------------------------
export type FlagQueryRow = {
  id: string;
  message_id: string;
  category: FlagCategory;
  note: string;
  status: FlagStatus;
  created_at: Date | string;
  resolved_at: Date | string | null;
};

// A queue row = a flag joined with the reviewer's context (conversation + trace).
export type FlagContextRow = FlagQueryRow & {
  conversation_id: string;
  query_text: string;
  mode: string;
  assistant_content: string;
};

// ---------------------------------------------------------------------------
// Pure mappers (no DB) — the tested seam.
// ---------------------------------------------------------------------------
function toIso(value: Date | string): string {
  return new Date(value).toISOString();
}

/** Row → FlagRow: ISO timestamps, null-safe resolvedAt, enum passthrough. */
export function mapFlagRow(row: FlagQueryRow): FlagRow {
  return {
    id: row.id,
    messageId: row.message_id,
    category: row.category,
    note: row.note,
    status: row.status,
    createdAt: toIso(row.created_at),
    resolvedAt: row.resolved_at == null ? null : toIso(row.resolved_at),
  };
}

/** Queue row → FlagWithContext: the base flag plus its joined conversation/trace. */
export function mapFlagWithContext(row: FlagContextRow): FlagWithContext {
  return {
    ...mapFlagRow(row),
    conversationId: row.conversation_id,
    queryText: row.query_text,
    mode: row.mode,
    assistantContent: row.assistant_content,
  };
}

/**
 * Group flag rows by their assistant message id (local accumulator; inputs
 * untouched). Powers the flag badges on the transcript.
 */
function groupFlagsByMessage(rows: readonly FlagQueryRow[]): Record<string, FlagRow[]> {
  const byMessage: Record<string, FlagRow[]> = {};
  for (const row of rows) {
    const mapped = mapFlagRow(row);
    const existing = byMessage[mapped.messageId];
    if (existing) existing.push(mapped);
    else byMessage[mapped.messageId] = [mapped];
  }
  return byMessage;
}

// ---------------------------------------------------------------------------
// Repository implementation.
// ---------------------------------------------------------------------------
async function create(input: {
  messageId: string;
  category: FlagCategory;
  note: string;
}): Promise<void> {
  const sql = getDb();
  await sql`
    insert into answer_flags (client_id, message_id, category, note, status)
    values (${DEFAULT_CLIENT_ID}, ${input.messageId}, ${input.category}, ${input.note}, 'open')
  `;
}

async function updateStatus(id: string, status: FlagStatus): Promise<void> {
  const sql = getDb();
  // resolved_at is set to now() only for terminal statuses, else cleared — the
  // conditional lives in SQL so the timestamp is DB-authoritative, never client.
  await sql`
    update answer_flags
    set status = ${status},
        resolved_at = case
          when ${status} in ('resolved', 'wontfix') then now()
          else null
        end
    where id = ${id}
  `;
}

async function queue(f: {
  status?: FlagStatus;
  page: number;
  limit: number;
}): Promise<Page<FlagWithContext>> {
  const { status, page, limit } = f;
  const sql = getDb();

  // Optional status filter as a composable fragment; `where true` keeps the
  // clause valid whether or not the fragment is appended (mirrors repos.ts).
  const statusFilter = status ? sql`and f.status = ${status}` : sql``;

  const countRows = await sql<{ total: number | string }[]>`
    select count(*) as total
    from answer_flags f
    join messages m on m.id = f.message_id
    join retrieval_traces t on t.message_id = m.id
    where true ${statusFilter}
  `;
  const total = Number(countRows[0]?.total ?? 0);

  const offset = (page - 1) * limit;
  const rows = await sql<FlagContextRow[]>`
    select
      f.id,
      f.message_id,
      f.category,
      f.note,
      f.status,
      f.created_at,
      f.resolved_at,
      m.conversation_id,
      m.content as assistant_content,
      t.query_text,
      t.mode
    from answer_flags f
    join messages m on m.id = f.message_id
    join retrieval_traces t on t.message_id = m.id
    where true ${statusFilter}
    order by f.created_at desc
    limit ${limit} offset ${offset}
  `;

  return {
    rows: rows.map(mapFlagWithContext),
    total,
    page,
    limit,
  };
}

async function forMessages(messageIds: string[]): Promise<Record<string, FlagRow[]>> {
  if (messageIds.length === 0) return {};
  const sql = getDb();
  const rows = await sql<FlagQueryRow[]>`
    select id, message_id, category, note, status, created_at, resolved_at
    from answer_flags
    where message_id = any(${messageIds})
    order by created_at desc
  `;
  return groupFlagsByMessage(rows);
}

/** Singleton repo — the app imports this; the interface pins the shape. */
export const flagRepo: FlagRepo = { create, updateStatus, queue, forMessages };
