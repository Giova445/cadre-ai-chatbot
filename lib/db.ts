// Lazy Postgres client (Supabase). The ONLY place a DB connection is created.
// Imported dynamically (never at module top-level in the bundle path) so a
// `bundle`-backend deploy never loads `postgres` or opens a connection.
//
// Serverless notes: use Supabase's TRANSACTION-mode pooler URL (port 6543) as
// DATABASE_URL. `prepare: false` is REQUIRED for that pooler (PgBouncer cannot
// share prepared statements across transactions). `max: 1` keeps each function
// instance to a single connection — the pooler handles fan-in.

import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

let client: Sql | null = null;

/** Get the shared Postgres client. Throws a clear error if DATABASE_URL is unset. */
export function getDb(): Sql {
  if (client) return client;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. The pgvector retrieval backend needs a Supabase/Postgres connection string (transaction-mode pooler, port 6543).",
    );
  }
  client = postgres(url, {
    prepare: false, // required for Supabase transaction-mode pooler (PgBouncer)
    // A small pool (not 1): admin pages fan out parallel reads (Promise.all) that
    // would otherwise serialize/starve on a single connection while chat after()/
    // logTurn transactions share it. The Supabase transaction pooler multiplexes
    // these down to few real DB connections, so a handful per instance is safe.
    max: Number(process.env.DB_POOL_MAX ?? "5"),
    idle_timeout: 20, // seconds; close idle conns so instances don't hoard the pool
  });
  return client;
}

/** True when a DB connection string is configured (posture check; no connection). */
export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Close the shared client. For short-lived CLI scripts (pnpm ingest) that must
 * exit cleanly; the long-lived runtime never calls this (the pool stays warm).
 */
export async function closeDb(): Promise<void> {
  if (client) {
    await client.end({ timeout: 5 });
    client = null;
  }
}
