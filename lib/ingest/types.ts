// Frozen contracts for the sitemap crawl pipeline (crawl_jobs / sitemap_pages).
// Shared by the crawl backend (writes) and the admin UI (reads).

export type CrawlJobStatus = "queued" | "crawling" | "done" | "error";
export type PageStatus = "queued" | "embedded" | "skipped" | "failed";
export type SkipReason =
  | "robots"
  | "noindex"
  | "unchanged"
  | "empty"
  | "no_text"
  | "non_html";

export type CrawlJob = {
  id: string;
  clientId: string;
  sitemapUrl: string;
  host: string;
  status: CrawlJobStatus;
  discovered: number;
  embedded: number;
  skipped: number;
  failed: number;
  error: string | null;
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

export type SitemapPage = {
  id: string;
  crawlJobId: string;
  clientId: string;
  url: string;
  lastmod: string | null;
  contentHash: string | null;
  status: PageStatus;
  skipReason: SkipReason | null;
  chunks: number;
  error: string | null;
  robotsAllowed: boolean;
  lastCrawled: string | null;
};

// Result of extracting one page's HTML (lib/ingest/extract.ts, HTML branch).
export type ExtractResult = {
  text: string; // main-article text (boilerplate stripped)
  title: string;
  noindex: boolean; // <meta name="robots" content="noindex">
};

export interface SitemapRepo {
  // Write path (crawl backend).
  createJob(input: {
    clientId: string;
    sitemapUrl: string;
    host: string;
    pages: { url: string; lastmod: string | null; robotsAllowed: boolean }[];
  }): Promise<string>; // returns jobId
  claimQueued(jobId: string, limit: number): Promise<SitemapPage[]>;
  markPage(
    id: string,
    patch: Partial<Pick<SitemapPage, "status" | "skipReason" | "chunks" | "error" | "contentHash" | "lastCrawled">>,
  ): Promise<void>;
  updateJobCounts(jobId: string): Promise<void>; // recompute embedded/skipped/failed + status
  pageByUrl(clientId: string, url: string): Promise<SitemapPage | null>; // dedup lookup

  // Read path (admin UI).
  getJob(id: string): Promise<CrawlJob | null>;
  listJobs(clientId: string | null, limit: number): Promise<CrawlJob[]>;
  listPages(jobId: string): Promise<SitemapPage[]>;
}
