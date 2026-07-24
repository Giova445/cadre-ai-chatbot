// Sitemap discovery. Fetches a sitemap.xml, parses <loc>/<lastmod>, fans out
// sitemap-index files to their child sitemaps, then normalizes + dedupes the
// URL list and caps the count. Pure parsing (parseSitemap) is unit-tested with
// no network; discover() adds the fetch + fan-out.
//
// Deliberately regex-based rather than a full XML DOM: sitemaps are a tiny,
// well-defined grammar (<urlset>/<sitemapindex> with <loc>/<lastmod>), and
// namespace-prefixed variants ("<image:loc>") are common — matching the base
// tag names is more robust here than DOM traversal, and keeps the module
// dependency-light and serverless-cold-start-cheap.

import { assertUrlAllowed, assertHostResolvesPublic, SsrfError } from "./ssrf";
import { FETCH_TIMEOUT_MS, MAX_BYTES, USER_AGENT } from "./fetch-page";

export const MAX_URLS = 1000;
export const MAX_CHILD_SITEMAPS = 50; // sitemap-index fan-out cap

export type SitemapEntry = { url: string; lastmod: string | null };

type ParsedSitemap =
  | { kind: "urlset"; entries: SitemapEntry[] }
  | { kind: "index"; sitemaps: string[] };

/** Decode the handful of XML entities that appear in <loc> values. */
function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function firstTag(block: string, tag: string): string | null {
  // Match <tag> or <ns:tag>, capture inner text.
  const re = new RegExp(`<(?:[a-zA-Z0-9]+:)?${tag}[^>]*>([\\s\\S]*?)</(?:[a-zA-Z0-9]+:)?${tag}>`, "i");
  const m = block.match(re);
  return m ? decodeXml(m[1]) : null;
}

function blocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:[a-zA-Z0-9]+:)?${tag}[\\s>][\\s\\S]*?</(?:[a-zA-Z0-9]+:)?${tag}>`, "gi");
  return xml.match(re) ?? [];
}

/**
 * Parse sitemap XML into either a URL set or an index (list of child sitemaps).
 * A file containing <sitemapindex> is treated as an index; otherwise as a urlset.
 * Pure — no network, no side effects.
 */
export function parseSitemap(xml: string): ParsedSitemap {
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  if (isIndex) {
    const sitemaps: string[] = [];
    for (const b of blocks(xml, "sitemap")) {
      const loc = firstTag(b, "loc");
      if (loc) sitemaps.push(loc);
    }
    return { kind: "index", sitemaps };
  }
  const entries: SitemapEntry[] = [];
  for (const b of blocks(xml, "url")) {
    const loc = firstTag(b, "loc");
    if (!loc) continue;
    entries.push({ url: loc, lastmod: firstTag(b, "lastmod") });
  }
  return { kind: "urlset", entries };
}

/** Normalize a URL for dedup: drop the fragment, lowercase the host, keep path. */
export function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    // Collapse a trailing "/" only on a bare-origin URL so "/" and "" dedupe.
    return u.toString();
  } catch {
    return null;
  }
}

async function fetchXml(urlStr: string): Promise<string> {
  const { url, host } = assertUrlAllowed(urlStr);
  await assertHostResolvesPublic(host);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, accept: "application/xml,text/xml,*/*" },
    });
    if (!res.ok) throw new Error(`Sitemap fetch failed: ${res.status}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw new Error("Sitemap exceeds size cap.");
    return new TextDecoder("utf-8").decode(buf);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch + parse a sitemap (following one level of index fan-out), then normalize
 * and dedupe the discovered URLs, capped at MAX_URLS. The crawl is later pinned
 * to the sitemap's own host; here we only collect + normalize.
 */
export async function discover(sitemapUrl: string): Promise<SitemapEntry[]> {
  const rootHost = assertUrlAllowed(sitemapUrl).host;
  const xml = await fetchXml(sitemapUrl);
  const parsed = parseSitemap(xml);

  const collected: SitemapEntry[] = [];
  if (parsed.kind === "index") {
    let childCount = 0;
    for (const child of parsed.sitemaps) {
      if (childCount >= MAX_CHILD_SITEMAPS) break;
      // Pin index fan-out to the same host (SSRF: an index must not point us
      // at arbitrary third-party or internal hosts).
      let childHost: string;
      try {
        childHost = assertUrlAllowed(child).host;
      } catch {
        continue;
      }
      if (childHost !== rootHost) continue;
      childCount++;
      try {
        const childXml = await fetchXml(child);
        const childParsed = parseSitemap(childXml);
        if (childParsed.kind === "urlset") collected.push(...childParsed.entries);
      } catch {
        // A broken child sitemap must not abort discovery of the rest.
        continue;
      }
      if (collected.length >= MAX_URLS) break;
    }
  } else {
    collected.push(...parsed.entries);
  }

  // Normalize + dedupe, cap the count.
  const seen = new Set<string>();
  const out: SitemapEntry[] = [];
  for (const entry of collected) {
    const norm = normalizeUrl(entry.url);
    if (!norm) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push({ url: norm, lastmod: entry.lastmod });
    if (out.length >= MAX_URLS) break;
  }
  return out;
}

export { SsrfError };
