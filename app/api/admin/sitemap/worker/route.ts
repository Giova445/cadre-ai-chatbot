// GET|POST /api/admin/sitemap/worker — the crawl drain endpoint. NOT admin-
// session gated (Cron/QStash can't present a browser cookie); gated instead by
// CRAWL_WORKER_SECRET presented as `Authorization: Bearer <secret>`, an
// `x-crawl-secret` header, or a `?secret=` query param. Drains one bounded batch
// for the oldest job with queued pages (or ?jobId), then reports remaining so
// the caller can self-continue. Node runtime (node:crypto/dns, postgres).

import { drain, BATCH_MAX } from "@/lib/ingest/crawl-worker";
import { oldestJobWithQueued } from "@/lib/ingest/sitemap-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Length-independent-ish constant-time-ish compare (no node:crypto import). */
function secretsMatch(provided: string, expected: string): boolean {
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

function presentedSecret(req: Request, url: URL): string {
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  return bearer || req.headers.get("x-crawl-secret") || url.searchParams.get("secret") || "";
}

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);

  const expected = process.env.CRAWL_WORKER_SECRET;
  if (!expected) {
    return Response.json({ error: "Worker is not configured." }, { status: 503 });
  }
  if (!secretsMatch(presentedSecret(req, url), expected)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const jobId = url.searchParams.get("jobId") ?? (await oldestJobWithQueued());
  if (!jobId) {
    return Response.json({ processed: 0, remaining: 0, idle: true });
  }

  const { processed, remaining } = await drain(jobId, BATCH_MAX);
  return Response.json({ jobId, processed, remaining });
}

export function GET(req: Request): Promise<Response> {
  return handle(req);
}

export function POST(req: Request): Promise<Response> {
  return handle(req);
}
