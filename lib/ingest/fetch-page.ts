// Single-page HTTP GET for the crawler. Hardened against SSRF, slow-loris, and
// oversized responses:
//   - ~10s timeout via AbortController
//   - ~3MB response size cap (streamed; aborts past the cap)
//   - <= 3 redirects, all pinned to the SAME host (re-validated each hop)
//   - Content-Type allowlist (text/html, application/xhtml+xml)
//   - reads X-Robots-Tag so the worker can honor header-level noindex
//
// Returns the raw HTML plus the signals the crawl worker needs. Never follows a
// redirect off-host or to a private address.

import { assertUrlAllowed, assertHostResolvesPublic, sameHost, SsrfError } from "./ssrf";

export const FETCH_TIMEOUT_MS = 10_000;
export const MAX_BYTES = 3 * 1024 * 1024; // 3MB
export const MAX_REDIRECTS = 3;
export const USER_AGENT = "CadreBot/1.0 (+https://gocadre.ai/bot)";

const HTML_TYPES = ["text/html", "application/xhtml+xml"];

export type FetchPageResult = {
  html: string;
  status: number;
  headers: Headers;
  finalUrl: string;
  contentType: string | null;
  xRobotsNoindex: boolean;
  // Non-throwing skip signal: set when the page was reachable but must not be
  // embedded for a structural reason (non-HTML, robots header). Worker maps it.
  nonHtml: boolean;
};

/** X-Robots-Tag: noindex (any of the comma/space separated tokens). */
function headerNoindex(headers: Headers): boolean {
  const tag = headers.get("x-robots-tag");
  if (!tag) return false;
  return tag
    .toLowerCase()
    .split(/[,\s]+/)
    .some((t) => t === "noindex" || t === "none");
}

function isHtml(contentType: string | null): boolean {
  if (!contentType) return false;
  const base = contentType.split(";")[0].trim().toLowerCase();
  return HTML_TYPES.includes(base);
}

/** Read a response body with a hard byte cap; aborts the stream past MAX_BYTES. */
async function readCapped(res: Response): Promise<string> {
  const body = res.body;
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX_BYTES) {
          await reader.cancel();
          throw new Error(`Response exceeded ${MAX_BYTES} byte cap.`);
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8").decode(merged);
}

/**
 * Fetch one page. `pinnedHost` (default: the URL's own host) constrains every
 * redirect hop to the same host and every hop is re-validated (SSRF + public
 * DNS). Manual redirect handling because `fetch(redirect:"follow")` would follow
 * off-host / to private IPs without our checks.
 */
export async function fetchPage(
  urlStr: string,
  pinnedHost?: string,
): Promise<FetchPageResult> {
  let current = urlStr;
  const pin = pinnedHost ?? assertUrlAllowed(urlStr).host;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const { url, host } = assertUrlAllowed(current);
    if (!sameHost(host, pin)) {
      throw new SsrfError(`Redirect off pinned host ${pin} → ${host} refused.`);
    }
    await assertHostResolvesPublic(host);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml",
        },
      });
    } finally {
      clearTimeout(timer);
    }

    // Manual redirect handling (3xx + Location), pinned to the same host.
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        return {
          html: "",
          status: res.status,
          headers: res.headers,
          finalUrl: url.toString(),
          contentType: res.headers.get("content-type"),
          xRobotsNoindex: headerNoindex(res.headers),
          nonHtml: true,
        };
      }
      current = new URL(location, url).toString();
      continue;
    }

    const contentType = res.headers.get("content-type");
    const xRobotsNoindex = headerNoindex(res.headers);

    if (!res.ok) {
      // Drain nothing; surface the status so the worker records a failure.
      await res.body?.cancel().catch(() => {});
      return {
        html: "",
        status: res.status,
        headers: res.headers,
        finalUrl: url.toString(),
        contentType,
        xRobotsNoindex,
        nonHtml: !isHtml(contentType),
      };
    }

    if (!isHtml(contentType)) {
      await res.body?.cancel().catch(() => {});
      return {
        html: "",
        status: res.status,
        headers: res.headers,
        finalUrl: url.toString(),
        contentType,
        xRobotsNoindex,
        nonHtml: true,
      };
    }

    const html = await readCapped(res);
    return {
      html,
      status: res.status,
      headers: res.headers,
      finalUrl: url.toString(),
      contentType,
      xRobotsNoindex,
      nonHtml: false,
    };
  }

  throw new SsrfError(`Too many redirects (> ${MAX_REDIRECTS}) for ${urlStr}.`);
}
