// Composable, DB-free SQL filter fragments shared by the admin repos. Extracted
// here (rather than inlined per query) so the compose-or-omit contract is a
// tested seam: each builder returns an EMPTY fragment when its value is absent,
// or a bounded `and <col> = <val>` fragment when present. Columns are hardcoded
// (never interpolated), so there is no identifier-injection surface.
//
// Both columns are UNQUALIFIED on purpose: `client_id` / `session_id` resolve
// unambiguously wherever these are used — the `conversations` grain in
// repos.ts (list/getDetail) and `answer_flags` in flag-repo.ts (the only joined
// table there that carries `client_id`). Queries whose FROM has neither column
// (e.g. gap-repo's retrieval_traces/messages join) build their own scoping
// fragment instead.

import type postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

/** `and client_id = $1` on the conversations/flags grain, or an empty fragment. */
export function clientFilter(sql: Sql, clientId?: string) {
  return clientId ? sql`and client_id = ${clientId}` : sql``;
}

/** `and session_id = $1` (deep-link to one browser session), or an empty fragment. */
export function sessionFilter(sql: Sql, sessionId?: string) {
  return sessionId ? sql`and session_id = ${sessionId}` : sql``;
}
