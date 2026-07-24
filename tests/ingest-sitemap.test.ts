// Sitemap parsing (pure): <loc>/<lastmod> extraction, sitemap-index detection,
// namespace-prefixed tags, entity decoding, and URL normalization/dedup keys.

import { describe, it, expect } from "vitest";
import { parseSitemap, normalizeUrl } from "@/lib/ingest/sitemap";

const URLSET = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://acme.com/</loc>
    <lastmod>2026-01-02</lastmod>
  </url>
  <url>
    <loc>https://acme.com/pricing?ref=a&amp;b=c</loc>
  </url>
  <url>
    <loc>https://acme.com/blog/post-1</loc>
    <lastmod>2026-05-01T10:00:00Z</lastmod>
  </url>
</urlset>`;

const INDEX = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://acme.com/sitemap-1.xml</loc></sitemap>
  <sitemap><loc>https://acme.com/sitemap-2.xml</loc></sitemap>
</sitemapindex>`;

describe("parseSitemap — urlset", () => {
  it("extracts loc + lastmod for each <url>", () => {
    const parsed = parseSitemap(URLSET);
    expect(parsed.kind).toBe("urlset");
    if (parsed.kind !== "urlset") return;
    expect(parsed.entries).toHaveLength(3);
    expect(parsed.entries[0]).toEqual({ url: "https://acme.com/", lastmod: "2026-01-02" });
    expect(parsed.entries[1].lastmod).toBeNull();
  });

  it("decodes XML entities in <loc>", () => {
    const parsed = parseSitemap(URLSET);
    if (parsed.kind !== "urlset") throw new Error("expected urlset");
    expect(parsed.entries[1].url).toBe("https://acme.com/pricing?ref=a&b=c");
  });
});

describe("parseSitemap — index", () => {
  it("detects a sitemap index and lists child sitemaps", () => {
    const parsed = parseSitemap(INDEX);
    expect(parsed.kind).toBe("index");
    if (parsed.kind !== "index") return;
    expect(parsed.sitemaps).toEqual([
      "https://acme.com/sitemap-1.xml",
      "https://acme.com/sitemap-2.xml",
    ]);
  });
});

describe("parseSitemap — namespaced tags", () => {
  it("matches <ns:loc> too", () => {
    const xml = `<urlset><url><ns:loc>https://acme.com/x</ns:loc></url></urlset>`;
    const parsed = parseSitemap(xml);
    if (parsed.kind !== "urlset") throw new Error("expected urlset");
    expect(parsed.entries[0].url).toBe("https://acme.com/x");
  });
});

describe("normalizeUrl", () => {
  it("drops the fragment and lowercases the host", () => {
    expect(normalizeUrl("https://ACME.com/a#section")).toBe("https://acme.com/a");
  });
  it("returns null for a non-URL", () => {
    expect(normalizeUrl("::::")).toBeNull();
  });
});
