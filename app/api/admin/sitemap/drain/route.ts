// POST /api/admin/sitemap/drain — admin-SESSION-gated manual kick for a stuck
// crawl job. The cron route (/api/admin/sitemap/worker) is secret-gated because
// QStash/Cron can't present a browser cookie; it must stay that way. This route
// is the operator's local + prod escape hatch: it reuses the SAME drain() from
// lib/ingest/crawl-worker.ts (no duplicated fetch/extract/upsert logic) and runs
// a bounded server-side loop — up to `maxIterations` passes of drain(), each pass
// a single BATCH_MAX slice — so a single click can finish a small job while
// staying under the function's maxDuration. The response surfaces { processed,
// remaining, done } so the UI shows progress and can re-kick if needed.
//
// Auth = requireAdmin() (the signed-cookie gate, the REAL boundary per
// lib/admin/auth.ts), NOT CRAWL_WORKER_SECRET. Node runtime (postgres, fetch).

import { requireAdmin } from "@/lib/admin/auth";
import { drain } from "@/lib/ingest/crawl-worker";
import { sitemapRepo } from "@/lib/ingest/sitemap-repo";
import { drainRequestSchema, clampBatch, type DrainResponse } from "@/lib/ingest/drain-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  await requireAdmin();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = drainRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "jobId must be a valid UUID." }, { status: 400 });
  }

  const jobId = parsed.data.jobId;
  const job = await sitemapRepo.getJob(jobId);
  if (!job) {
    return Response.json({ error: "Crawl job not found." }, { status: 404 });
  }

  // Bounded server-side loop: each pass drains one BATCH_MAX slice. Stops when
  // the queue is empty, when the iteration budget is exhausted, or when a pass
  // made no progress (stuck/empty). One click can finish a small job; a large
  // job returns remaining > 0 so the operator can kick again. Stays under
  // maxDuration because each pass is a single bounded batch, not the whole queue.
  let iterations = 0;
  let processed = 0;
  let remaining = 0;
  const batch = clampBatch(parsed.data.batch);
  while (iterations < parsed.data.maxIterations) {
    const pass = await drain(jobId, batch);
    iterations++;
    processed += pass.processed;
    remaining = pass.remaining;
    if (pass.remaining <= 0) break;
    if (pass.processed === 0) break;
  }

  const body: DrainResponse = { jobId, iterations, processed, remaining, done: remaining <= 0 };
  return Response.json(body, { status: 200 });
}
