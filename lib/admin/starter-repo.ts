// Read/write repository for maker-configurable starter questions (Rollout § C).
// Like flag-repo.ts (Phase 4) this module both SELECTs and INSERT/UPDATE/DELETEs
// the starter_questions table. Row→read-model shaping lives in pure mapper
// helpers (mapStarterRow / publicStartersFromRows) so the contract is
// unit-testable without a live connection (mirrors lib/admin/flag-repo.ts and
// lib/admin/repos.ts). The public read path runs every row through the shared
// sanitizeStarters() (lib/starters.ts) so the same bounds/dedupe/junk rules
// apply on the endpoint that the widget and hosted page enforce.

import { getDb } from "../db";
import { sanitizeStarters } from "../starters";
import type { StarterRow, StarterRepo } from "./contracts";

// ---------------------------------------------------------------------------
// Raw DB row shape (snake_case). `position` is `number | string` because the pg
// driver can return integer columns as strings; the mapper coerces defensively.
// ---------------------------------------------------------------------------
export type StarterQueryRow = {
  id: string;
  client_id: string;
  position: number | string;
  text: string;
  enabled: boolean;
};

// ---------------------------------------------------------------------------
// Pure mappers (no DB) — the tested seam.
// ---------------------------------------------------------------------------

/** Row → StarterRow: numeric position coerced, everything else passed across. */
export function mapStarterRow(row: StarterQueryRow): StarterRow {
  return {
    id: row.id,
    clientId: row.client_id,
    position: Number(row.position),
    text: row.text,
    enabled: row.enabled,
  };
}

/**
 * Enabled rows (in the order given) → sanitized chip labels — the tested seam
 * for publicList. Drops disabled rows here (defense-in-depth on top of the SQL
 * `enabled` filter) and runs the shared sanitizer: trim, collapse whitespace,
 * dedupe case-insensitively, cap length + count, drop empties/junk. Inputs are
 * never mutated (a fresh array is built).
 */
export function publicStartersFromRows(rows: readonly StarterQueryRow[]): string[] {
  const texts = rows.filter((r) => r.enabled).map((r) => r.text);
  return sanitizeStarters(texts);
}

// ---------------------------------------------------------------------------
// Repository implementation.
// ---------------------------------------------------------------------------

/** All rows for a tenant, ordered by position — the admin editor view. */
async function list(clientId: string): Promise<StarterRow[]> {
  const sql = getDb();
  const rows = await sql<StarterQueryRow[]>`
    select id, client_id, position, text, enabled
    from starter_questions
    where client_id = ${clientId}
    order by position asc
  `;
  return rows.map(mapStarterRow);
}

/** Enabled rows for a tenant, ordered, sanitized to string[] — the public endpoint view. */
async function publicList(clientId: string): Promise<string[]> {
  const sql = getDb();
  const rows = await sql<StarterQueryRow[]>`
    select id, client_id, position, text, enabled
    from starter_questions
    where client_id = ${clientId} and enabled = true
    order by position asc
  `;
  return publicStartersFromRows(rows);
}

/** Append a new question at max(position)+1 for the tenant (first row → 0). */
async function create(input: { clientId: string; text: string }): Promise<void> {
  const sql = getDb();
  // The subquery computes the next slot atomically inside the INSERT so two
  // appends can't both read the same max; unique (client_id, position) is the
  // backstop. coalesce(..., 0) seeds the first row of an empty tenant at 0.
  await sql`
    insert into starter_questions (client_id, position, text)
    values (
      ${input.clientId},
      coalesce((select max(position) + 1 from starter_questions where client_id = ${input.clientId}), 0),
      ${input.text}
    )
  `;
}

/**
 * Partial update of a single question. Only the provided fields change; an
 * omitted field is left untouched via coalesce(NULL, column). Parameters carry
 * explicit ::text / ::boolean casts so the transaction-mode pooler (prepare:
 * false) can bind a NULL without "could not determine data type". updated_at is
 * always DB-authoritative (now()), never client-supplied.
 */
async function update(
  id: string,
  input: { text?: string; enabled?: boolean },
): Promise<void> {
  const sql = getDb();
  await sql`
    update starter_questions
    set text = coalesce(${input.text ?? null}::text, text),
        enabled = coalesce(${input.enabled ?? null}::boolean, enabled),
        updated_at = now()
    where id = ${id}
  `;
}

/**
 * Rewrite positions to match orderedIds (index → position) in ONE transaction.
 * Expects the COMPLETE ordered id set for the tenant. Two-phase to dodge the
 * unique (client_id, position) constraint: first park every row at a distinct
 * negative slot, then assign the final 0..n-1 — so a swap can't transiently
 * collide with a row that hasn't moved yet. Every UPDATE is scoped to clientId
 * so a crafted id from another tenant can't be reordered in.
 */
async function reorder(clientId: string, orderedIds: string[]): Promise<void> {
  const sql = getDb();
  await sql.begin(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx`
        update starter_questions
        set position = ${-1 - i}, updated_at = now()
        where id = ${orderedIds[i]} and client_id = ${clientId}
      `;
    }
    for (let i = 0; i < orderedIds.length; i++) {
      await tx`
        update starter_questions
        set position = ${i}, updated_at = now()
        where id = ${orderedIds[i]} and client_id = ${clientId}
      `;
    }
  });
}

/** Hard-delete a single question by id. */
async function remove(id: string): Promise<void> {
  const sql = getDb();
  await sql`delete from starter_questions where id = ${id}`;
}

/** Singleton repo — the app imports this; the interface pins the shape. */
export const starterRepo: StarterRepo = {
  list,
  publicList,
  create,
  update,
  reorder,
  delete: remove,
};
