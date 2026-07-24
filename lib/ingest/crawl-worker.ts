// Crawl worker — drains a bounded batch of queued sitemap_pages for one job:
//   robots → fetch → noindex/non-html/empty gates → content_hash change-detect →
//   REUSE lib/ingest/core.ingestSource (chunk→embed→atomic upsert) → per-page
//   status. Each page runs in its own try/catch: one failure marks that page
//   'failed' and the loop continues. Nothing here re-implements chunk/embed/
//   upsert — a page whose HTML is text is "just another source".

import { createHash } from "node:crypto";
import { ingestSource } from "./core";
import { sitemapRepo } from "./sitemap-repo";
import { fetchPage } from "./fetch-page";
import { extractHtml, wordCount, MIN_PAGE_WORDS } from "./extract";
import { loadRobots, type RobotsRules } from "./robots";
import { getDb } from "@/lib/db";
import type { SitemapPage } from "./types";

export const BATCH_MAX = 8;
export const CRAWL_TAGS = ["sitemap"];

export type DrainResult = { processed: number; remaining: number };

/** sha256 of the extracted text — the change-detection / dedup key. */
export function contentHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function remainingQueued(jobId: string): Promise<number> {
  const sql = getDb();
  const [row] = await sql<{ n: number | string }[]>`
    select count(*) as n from sitemap_pages
    where crawl_job_id = ${jobId} and status = 'queued'
  `;
  return Number(row?.n ?? 0);
}

/**
 * Process a single already-claimed page. Returns nothing; writes the page's
 * terminal status via markPage. Isolated so the drain loop can catch per page.
 */
async function processPage(
  page: SitemapPage,
  clientId: string,
  host: string,
  robots: RobotsRules,
): Promise<void> {
  // 1. robots (re-checked against loaded rules; discovery already filtered, this
  //    catches a robots.txt that changed since discovery).
  if (!robots.isAllowed(page.url)) {
    await sitemapRepo.markPage(page.id, { status: "skipped", skipReason: "robots" });
    return;
  }

  // 2. fetch
  const res = await fetchPage(page.url, host);
  if (res.xRobotsNoindex) {
    await sitemapRepo.markPage(page.id, {
      status: "skipped",
      skipReason: "noindex",
      lastCrawled: new Date().toISOString(),
    });
    return;
  }
  if (res.nonHtml) {
    await sitemapRepo.markPage(page.id, {
      status: "skipped",
      skipReason: "non_html",
      lastCrawled: new Date().toISOString(),
    });
    return;
  }
  if (res.status < 200 || res.status >= 300 || !res.html) {
    await sitemapRepo.markPage(page.id, {
      status: "failed",
      error: `HTTP ${res.status}`,
      lastCrawled: new Date().toISOString(),
    });
    return;
  }

  // 3. extract + noindex meta + word-floor gates
  const { text, title, noindex } = extractHtml(res.html, page.url);
  if (noindex) {
    await sitemapRepo.markPage(page.id, {
      status: "skipped",
      skipReason: "noindex",
      lastCrawled: new Date().toISOString(),
    });
    return;
  }
  const words = wordCount(text);
  if (words === 0) {
    await sitemapRepo.markPage(page.id, {
      status: "skipped",
      skipReason: "empty",
      lastCrawled: new Date().toISOString(),
    });
    return;
  }
  if (words < MIN_PAGE_WORDS) {
    await sitemapRepo.markPage(page.id, {
      status: "skipped",
      skipReason: "no_text",
      lastCrawled: new Date().toISOString(),
    });
    return;
  }

  // 4. change-detection — unchanged hash ⇒ NO embed, NO upsert.
  const hash = contentHash(text);
  if (page.contentHash && page.contentHash === hash) {
    await sitemapRepo.markPage(page.id, {
      status: "skipped",
      skipReason: "unchanged",
      lastCrawled: new Date().toISOString(),
    });
    return;
  }

  // 5. changed/new ⇒ REUSE the shared ingest core (chunk→embed→atomic upsert).
  const result = await ingestSource({
    clientId,
    source: page.url,
    title,
    tags: CRAWL_TAGS,
    text,
  });
  await sitemapRepo.markPage(page.id, {
    status: "embedded",
    chunks: result.chunks,
    contentHash: hash,
    lastCrawled: new Date().toISOString(),
    error: null,
    skipReason: null,
  });
}

/**
 * Drain up to `batch` queued pages for `jobId`. Loads robots.txt once per drain
 * (per the job's host), processes each page best-effort, then recomputes the
 * job's counters (flipping it to `done` when no queued pages remain). Safe to
 * re-run: an already-embedded page whose hash is unchanged is a no-op next time.
 */
export async function drain(jobId: string, batch = BATCH_MAX): Promise<DrainResult> {
  const job = await sitemapRepo.getJob(jobId);
  if (!job) return { processed: 0, remaining: 0 };

  const pages = await sitemapRepo.claimQueued(jobId, batch);
  if (pages.length === 0) {
    await sitemapRepo.updateJobCounts(jobId);
    return { processed: 0, remaining: 0 };
  }

  const robots = await loadRobots(job.host);

  let processed = 0;
  for (const page of pages) {
    try {
      await processPage(page, job.clientId, job.host, robots);
    } catch (err) {
      await sitemapRepo
        .markPage(page.id, {
          status: "failed",
          error: err instanceof Error ? err.message.slice(0, 500) : "crawl error",
          lastCrawled: new Date().toISOString(),
        })
        .catch(() => {});
    }
    processed++;
  }

  await sitemapRepo.updateJobCounts(jobId);
  const remaining = await remainingQueued(jobId);
  return { processed, remaining };
}
