// Public widget-config endpoint (Rollout § C, § 4.3). This is the read
// counterpart to the admin write actions and the ONLY way DB-managed starters
// reach a vanilla widget on a third-party origin. Public + read-only: it exposes
// nothing sensitive (the same chips any visitor to the maker's site will see).
//
//   GET /api/widget-config?client=acme → 200 { "starters": ["…", "…"] }
//     • enabled rows, position-ordered, already sanitized (starterRepo.publicList)
//     • falls back to DEFAULT_STARTERS when the tenant has no rows — never empty
//     • never errors loudly: a missing/unreachable DB also yields the defaults
//
// CORS mirrors /api/chat (lib/cors.ts) so the cross-origin widget can read it.
// nodejs runtime is required — starterRepo → getDb() uses the `postgres` lib.

import { z } from "zod";
import { corsHeaders } from "@/lib/cors";
import { starterRepo } from "@/lib/admin/starter-repo";
import { DEFAULT_STARTERS } from "@/lib/starters";

export const runtime = "nodejs";

// Same bound as the chat route's `client` field; unknown/absent/over-long → the
// "default" tenant, whose empty starter set resolves to DEFAULT_STARTERS.
const clientSchema = z.string().min(1).max(64);

function resolveClientParam(raw: string | null): string {
  const parsed = clientSchema.safeParse(raw);
  return parsed.success ? parsed.data : "default";
}

// CORS preflight for cross-origin widget embeds.
export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin, req.headers.get("host")),
  });
}

export async function GET(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  const cors = corsHeaders(origin, host);

  const client = resolveClientParam(new URL(req.url).searchParams.get("client"));

  let starters: string[] = [];
  try {
    starters = await starterRepo.publicList(client);
  } catch (err) {
    // DB unconfigured/unreachable → serve defaults, never 500. This is public
    // UI config; the widget must always receive a usable list.
    console.error("[widget-config] publicList failed:", err);
  }

  // No rows (or a failed fetch) → the built-in defaults. Never empty.
  const body = {
    starters: starters.length > 0 ? starters : [...DEFAULT_STARTERS],
  };

  return new Response(JSON.stringify(body), {
    headers: {
      ...cors,
      "Content-Type": "application/json; charset=utf-8",
      // Starters change rarely; a few minutes of edge staleness is fine, and
      // stale-while-revalidate keeps the widget fast while a new value warms.
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
    },
  });
}
