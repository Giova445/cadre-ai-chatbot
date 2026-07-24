// POST /api/admin/sitemap — admin-gated sitemap discovery. Validates + SSRF-
// checks the submitted sitemap URL, fetches & parses it (index fan-out), loads
// robots.txt, marks each URL allowed/disallowed, and writes a crawl_jobs row +
// N queued sitemap_pages. Does NOT crawl inline (returns 202 immediately); the
// bounded worker drains the queue. Node runtime (node:crypto/dns, postgres).

import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { resolveClient } from "@/lib/clients";
import { discover } from "@/lib/ingest/sitemap";
import { loadRobots } from "@/lib/ingest/robots";
import { sitemapRepo } from "@/lib/ingest/sitemap-repo";
import { assertUrlAllowed, assertHostResolvesPublic, sameHost, SsrfError } from "@/lib/ingest/ssrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  sitemapUrl: z.string().url().max(2048),
  client: z.string().max(64).optional(),
});

export async function POST(req: Request): Promise<Response> {
  await requireAdmin(); // redirects/throws when unauthenticated

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "sitemapUrl must be a valid URL." }, { status: 400 });
  }

  // SSRF: https-only, reject private/loopback/link-local/metadata, resolve the
  // host and re-check every resolved address (DNS-rebinding defense).
  let host: string;
  try {
    const checked = assertUrlAllowed(parsed.data.sitemapUrl);
    host = checked.host;
    await assertHostResolvesPublic(host);
  } catch (err) {
    if (err instanceof SsrfError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    return Response.json({ error: "Could not validate the sitemap URL." }, { status: 400 });
  }

  const origin = req.headers.get("origin");
  const clientId = resolveClient({ client: parsed.data.client, origin });

  // Discover URLs (fetch + parse + fan-out + normalize + dedupe + cap).
  let entries: { url: string; lastmod: string | null }[];
  try {
    entries = await discover(parsed.data.sitemapUrl);
  } catch (err) {
    const message = err instanceof SsrfError ? err.message : "Failed to fetch or parse the sitemap.";
    return Response.json({ error: message }, { status: 502 });
  }

  if (entries.length === 0) {
    return Response.json({ error: "Sitemap contained no crawlable URLs." }, { status: 422 });
  }

  // Pin every discovered URL to the sitemap's host (SSRF) and mark robots state.
  const robots = await loadRobots(host);
  const pages = entries
    .filter((e) => {
      try {
        return sameHost(assertUrlAllowed(e.url).host, host);
      } catch {
        return false;
      }
    })
    .map((e) => ({
      url: e.url,
      lastmod: e.lastmod,
      robotsAllowed: robots.isAllowed(e.url),
    }));

  if (pages.length === 0) {
    return Response.json({ error: "No sitemap URLs matched the sitemap's host." }, { status: 422 });
  }

  const jobId = await sitemapRepo.createJob({
    clientId,
    sitemapUrl: parsed.data.sitemapUrl,
    host,
    pages,
  });

  return Response.json({ jobId, discovered: pages.length }, { status: 202 });
}
