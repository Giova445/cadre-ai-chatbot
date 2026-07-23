// Read-only repository for the admin client (tenant) selector (Rollout § B —
// per-client history). SELECT-only; nothing here mutates the DB. Row→read-model
// shaping lives in a pure mapper (mapClientRow) so the contract is unit-testable
// without a live connection (mirrors lib/admin/repos.ts / flag-repo / gap-repo).

import { getDb } from "../db";
import type { ClientSummary } from "./contracts";

// ---------------------------------------------------------------------------
// Raw DB row shape (snake_case). `count` is `number | string` because the pg
// driver returns count(*) (bigint) as a string; the mapper coerces defensively.
// `last_at` is `Date | string | null` — null only if a tenant had rows deleted
// mid-aggregate; normalized to an ISO string or null.
// ---------------------------------------------------------------------------
export type ClientQueryRow = {
  client_id: string;
  count: number | string;
  last_at: Date | string | null;
};

// ---------------------------------------------------------------------------
// Pure mapper (no DB) — the tested seam.
// ---------------------------------------------------------------------------
/** Row → ClientSummary: coerced count, ISO (or null) last activity. */
export function mapClientRow(row: ClientQueryRow): ClientSummary {
  return {
    id: row.client_id,
    conversationCount: Number(row.count),
    lastActivityAt: row.last_at == null ? null : new Date(row.last_at).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Repository implementation (read-only query).
// ---------------------------------------------------------------------------
/** Every tenant that has logged at least one conversation, most-recent first. */
async function listClients(): Promise<ClientSummary[]> {
  const sql = getDb();
  const rows = await sql<ClientQueryRow[]>`
    select client_id, count(*) as count, max(last_at) as last_at
    from conversations
    group by client_id
    order by max(last_at) desc
  `;
  return rows.map(mapClientRow);
}

/** Singleton repo — the app imports this; the shape mirrors the other repos. */
export const clientRepo = { listClients };
