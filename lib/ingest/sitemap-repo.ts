// SitemapRepo — the crawl ledger's data access (crawl_jobs + sitemap_pages).
// Row→model shaping lives in pure mappers (mapJobRow / mapPageRow) so the
// contract is unit-testable with no live connection, mirroring lib/admin/*-repo.
// All SQL is parameterized (postgres.js tagged templates); url/source are values,
// never interpolated.

import { getDb } from "@/lib/db";
import type {
  CrawlJob,
  CrawlJobStatus,
  PageStatus,
  SitemapPage,
  SitemapRepo,
  SkipReason,
} from "./types";

// ---------------------------------------------------------------------------
// Raw DB row shapes (snake_case). Timestamps arrive as Date | string depending
// on the driver path; the mappers normalize to ISO strings (or null).
// ---------------------------------------------------------------------------
export type CrawlJobRow = {
  id: string;
  client_id: string;
  sitemap_url: string;
  host: string;
  status: string;
  discovered: number | string;
  embedded: number | string;
  skipped: number | string;
  failed: number | string;
  error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type SitemapPageRow = {
  id: string;
  crawl_job_id: string;
  client_id: string;
  url: string;
  lastmod: Date | string | null;
  content_hash: string | null;
  status: string;
  skip_reason: string | null;
  chunks: number | string;
  error: string | null;
  robots_allowed: boolean;
  last_crawled: Date | string | null;
};

function iso(v: Date | string | null): string | null {
  if (v == null) return null;
  return new Date(v).toISOString();
}

// ---------------------------------------------------------------------------
// Pure mappers (the tested seam) — no DB.
// ---------------------------------------------------------------------------
export function mapJobRow(row: CrawlJobRow): CrawlJob {
  return {
    id: row.id,
    clientId: row.client_id,
    sitemapUrl: row.sitemap_url,
    host: row.host,
    status: row.status as CrawlJobStatus,
    discovered: Number(row.discovered),
    embedded: Number(row.embedded),
    skipped: Number(row.skipped),
    failed: Number(row.failed),
    error: row.error,
    createdAt: iso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: iso(row.updated_at) ?? new Date(0).toISOString(),
  };
}

export function mapPageRow(row: SitemapPageRow): SitemapPage {
  return {
    id: row.id,
    crawlJobId: row.crawl_job_id,
    clientId: row.client_id,
    url: row.url,
    lastmod: iso(row.lastmod),
    contentHash: row.content_hash,
    status: row.status as PageStatus,
    skipReason: (row.skip_reason as SkipReason | null) ?? null,
    chunks: Number(row.chunks),
    error: row.error,
    robotsAllowed: Boolean(row.robots_allowed),
    lastCrawled: iso(row.last_crawled),
  };
}

// camelCase patch field → snake_case column (only the markPage-writable set).
const PAGE_PATCH_COLUMNS: Record<string, string> = {
  status: "status",
  skipReason: "skip_reason",
  chunks: "chunks",
  error: "error",
  contentHash: "content_hash",
  lastCrawled: "last_crawled",
};

const JOB_COLS = "id, client_id, sitemap_url, host, status, discovered, embedded, skipped, failed, error, created_at, updated_at";
const PAGE_COLS = "id, crawl_job_id, client_id, url, lastmod, content_hash, status, skip_reason, chunks, error, robots_allowed, last_crawled";

// ---------------------------------------------------------------------------
// Repository implementation.
// ---------------------------------------------------------------------------
async function createJob(input: {
  clientId: string;
  sitemapUrl: string;
  host: string;
  pages: { url: string; lastmod: string | null; robotsAllowed: boolean }[];
}): Promise<string> {
  const sql = getDb();
  return sql.begin(async (tx) => {
    const [job] = await tx<{ id: string }[]>`
      insert into crawl_jobs (client_id, sitemap_url, host, status, discovered)
      values (${input.clientId}, ${input.sitemapUrl}, ${input.host}, 'queued', ${input.pages.length})
      returning id
    `;
    for (const p of input.pages) {
      // Re-crawl carry: on conflict KEEP content_hash + last_crawled (so the
      // unchanged-detection still works across jobs) but reset the work state.
      await tx`
        insert into sitemap_pages
          (crawl_job_id, client_id, url, lastmod, status, robots_allowed)
        values
          (${job.id}, ${input.clientId}, ${p.url},
           ${p.lastmod ? new Date(p.lastmod) : null},
           ${p.robotsAllowed ? "queued" : "skipped"}, ${p.robotsAllowed})
        on conflict (client_id, url) do update set
          crawl_job_id   = excluded.crawl_job_id,
          lastmod        = excluded.lastmod,
          robots_allowed = excluded.robots_allowed,
          status         = excluded.status,
          skip_reason    = case when excluded.robots_allowed then null else 'robots' end,
          error          = null
      `;
      if (!p.robotsAllowed) {
        // Persist the robots skip reason on the freshly-inserted row too.
        await tx`
          update sitemap_pages set skip_reason = 'robots'
          where client_id = ${input.clientId} and url = ${p.url} and status = 'skipped'
        `;
      }
    }
    return job.id;
  });
}

async function claimQueued(jobId: string, limit: number): Promise<SitemapPage[]> {
  const sql = getDb();
  const rows = await sql<SitemapPageRow[]>`
    select ${sql.unsafe(PAGE_COLS)} from sitemap_pages
    where crawl_job_id = ${jobId} and status = 'queued'
    order by created_at asc
    limit ${limit}
  `;
  return rows.map(mapPageRow);
}

async function markPage(
  id: string,
  patch: Partial<Pick<SitemapPage, "status" | "skipReason" | "chunks" | "error" | "contentHash" | "lastCrawled">>,
): Promise<void> {
  const sql = getDb();
  const set: Record<string, unknown> = {};
  for (const [key, col] of Object.entries(PAGE_PATCH_COLUMNS)) {
    if (key in patch) {
      const value = (patch as Record<string, unknown>)[key];
      set[col] = key === "lastCrawled" && typeof value === "string" ? new Date(value) : value;
    }
  }
  if (Object.keys(set).length === 0) return;
  await sql`update sitemap_pages set ${sql(set)} where id = ${id}`;
}

async function updateJobCounts(jobId: string): Promise<void> {
  const sql = getDb();
  await sql`
    update crawl_jobs c set
      embedded = counts.embedded,
      skipped  = counts.skipped,
      failed   = counts.failed,
      status   = case when counts.queued = 0 then 'done' else 'crawling' end,
      updated_at = now()
    from (
      select
        count(*) filter (where status = 'embedded') as embedded,
        count(*) filter (where status = 'skipped')  as skipped,
        count(*) filter (where status = 'failed')   as failed,
        count(*) filter (where status = 'queued')   as queued
      from sitemap_pages where crawl_job_id = ${jobId}
    ) counts
    where c.id = ${jobId}
  `;
}

async function pageByUrl(clientId: string, url: string): Promise<SitemapPage | null> {
  const sql = getDb();
  const [row] = await sql<SitemapPageRow[]>`
    select ${sql.unsafe(PAGE_COLS)} from sitemap_pages
    where client_id = ${clientId} and url = ${url}
    limit 1
  `;
  return row ? mapPageRow(row) : null;
}

async function getJob(id: string): Promise<CrawlJob | null> {
  const sql = getDb();
  const [row] = await sql<CrawlJobRow[]>`
    select ${sql.unsafe(JOB_COLS)} from crawl_jobs where id = ${id} limit 1
  `;
  return row ? mapJobRow(row) : null;
}

async function listJobs(clientId: string | null, limit: number): Promise<CrawlJob[]> {
  const sql = getDb();
  const rows = clientId
    ? await sql<CrawlJobRow[]>`
        select ${sql.unsafe(JOB_COLS)} from crawl_jobs
        where client_id = ${clientId} order by created_at desc limit ${limit}`
    : await sql<CrawlJobRow[]>`
        select ${sql.unsafe(JOB_COLS)} from crawl_jobs
        order by created_at desc limit ${limit}`;
  return rows.map(mapJobRow);
}

async function listPages(jobId: string): Promise<SitemapPage[]> {
  const sql = getDb();
  const rows = await sql<SitemapPageRow[]>`
    select ${sql.unsafe(PAGE_COLS)} from sitemap_pages
    where crawl_job_id = ${jobId} order by created_at asc
  `;
  return rows.map(mapPageRow);
}

/** Oldest job that still has queued pages (worker default target). */
export async function oldestJobWithQueued(): Promise<string | null> {
  const sql = getDb();
  const [row] = await sql<{ crawl_job_id: string }[]>`
    select distinct on (j.created_at) p.crawl_job_id
    from sitemap_pages p join crawl_jobs j on j.id = p.crawl_job_id
    where p.status = 'queued'
    order by j.created_at asc
    limit 1
  `;
  return row ? row.crawl_job_id : null;
}

export const sitemapRepo: SitemapRepo = {
  createJob,
  claimQueued,
  markPage,
  updateJobCounts,
  pageByUrl,
  getJob,
  listJobs,
  listPages,
};
