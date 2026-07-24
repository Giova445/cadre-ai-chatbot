// Pure mapper tests for SitemapRepo — no DB. Pins row→model shaping: count
// coercion (bigint arrives as a string), timestamp→ISO normalization, null
// safety, and status/skipReason pass-through.

import { describe, it, expect } from "vitest";
import {
  mapJobRow,
  mapPageRow,
  type CrawlJobRow,
  type SitemapPageRow,
} from "@/lib/ingest/sitemap-repo";

describe("mapJobRow", () => {
  const base: CrawlJobRow = {
    id: "job-1",
    client_id: "acme",
    sitemap_url: "https://acme.com/sitemap.xml",
    host: "acme.com",
    status: "crawling",
    discovered: "10",
    embedded: "4",
    skipped: 3,
    failed: "1",
    error: null,
    created_at: new Date("2026-07-23T10:00:00.000Z"),
    updated_at: "2026-07-23T10:05:00.000Z",
  };

  it("coerces string counts to numbers", () => {
    const j = mapJobRow(base);
    expect(j.discovered).toBe(10);
    expect(j.embedded).toBe(4);
    expect(j.failed).toBe(1);
    expect(typeof j.discovered).toBe("number");
  });

  it("normalizes timestamps to ISO (Date or string input)", () => {
    const j = mapJobRow(base);
    expect(j.createdAt).toBe("2026-07-23T10:00:00.000Z");
    expect(j.updatedAt).toBe("2026-07-23T10:05:00.000Z");
  });

  it("passes status + error through", () => {
    expect(mapJobRow(base).status).toBe("crawling");
    expect(mapJobRow({ ...base, error: "boom" }).error).toBe("boom");
  });
});

describe("mapPageRow", () => {
  const base: SitemapPageRow = {
    id: "page-1",
    crawl_job_id: "job-1",
    client_id: "acme",
    url: "https://acme.com/pricing",
    lastmod: "2026-05-01T00:00:00.000Z",
    content_hash: "abc123",
    status: "embedded",
    skip_reason: null,
    chunks: "5",
    error: null,
    robots_allowed: true,
    last_crawled: new Date("2026-07-23T11:00:00.000Z"),
  };

  it("coerces chunks and maps status", () => {
    const p = mapPageRow(base);
    expect(p.chunks).toBe(5);
    expect(p.status).toBe("embedded");
  });

  it("normalizes nullable timestamps", () => {
    expect(mapPageRow(base).lastCrawled).toBe("2026-07-23T11:00:00.000Z");
    expect(mapPageRow({ ...base, lastmod: null }).lastmod).toBeNull();
    expect(mapPageRow({ ...base, last_crawled: null }).lastCrawled).toBeNull();
  });

  it("carries skip_reason through when skipped", () => {
    const p = mapPageRow({ ...base, status: "skipped", skip_reason: "unchanged" });
    expect(p.status).toBe("skipped");
    expect(p.skipReason).toBe("unchanged");
  });

  it("coerces robots_allowed to a boolean", () => {
    expect(mapPageRow({ ...base, robots_allowed: false }).robotsAllowed).toBe(false);
  });
});
