// robots.txt fetch + parse for the crawler UA "CadreBot". Honors Disallow rules
// from the most-specific matching group (an explicit "CadreBot" group wins over
// the "*" group). A sitemap entry is NOT consent to crawl a disallowed path, so
// the crawl worker checks isAllowed(url) before fetching any page.
//
// parseRobots is pure (unit-tested with no network); loadRobots adds the fetch
// and fails OPEN (allow all) when robots.txt is missing/unreachable — the
// standard interpretation (no robots.txt ⇒ nothing disallowed).

import { assertUrlAllowed, assertHostResolvesPublic } from "./ssrf";
import { FETCH_TIMEOUT_MS, USER_AGENT } from "./fetch-page";

// The product token robots.txt groups are matched against (case-insensitive).
export const USER_AGENT_TOKEN = "CadreBot";

export type RobotsRules = {
  isAllowed(url: string): boolean;
};

type Group = { disallow: string[]; allow: string[] };

/**
 * Parse robots.txt into the rules that apply to our UA. We build the union of
 * the "*" group and any group naming our UA token, with our UA's explicit rules
 * taking precedence. Pure; no network.
 */
export function parseRobots(text: string): RobotsRules {
  const lines = text.split(/\r?\n/);
  const groups: { agents: string[]; rules: Group }[] = [];
  let current: { agents: string[]; rules: Group } | null = null;
  let lastWasAgent = false;

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "user-agent") {
      if (!lastWasAgent || !current) {
        current = { agents: [], rules: { disallow: [], allow: [] } };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === "disallow") current.rules.disallow.push(value);
    else if (field === "allow") current.rules.allow.push(value);
  }

  const ua = USER_AGENT_TOKEN.toLowerCase();
  const starGroup = groups.find((g) => g.agents.includes("*"));
  const uaGroup = groups.find((g) => g.agents.includes(ua));

  // UA-specific group wins entirely when present (per RFC 9309: the most
  // specific matching group applies); otherwise fall back to "*".
  const active: Group | null = uaGroup?.rules ?? starGroup?.rules ?? null;

  return { isAllowed: (url: string) => isAllowedBy(active, url) };
}

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url.startsWith("/") ? url : `/${url}`;
  }
}

/** Longest-match Allow/Disallow evaluation (RFC 9309 semantics, simplified). */
function isAllowedBy(group: Group | null, url: string): boolean {
  if (!group) return true;
  const path = pathOf(url);
  const match = (rule: string): number => {
    if (rule === "") return -1; // empty Disallow = allow everything
    // Support the "$" end anchor and "*" wildcard minimally.
    const hasEnd = rule.endsWith("$");
    const core = hasEnd ? rule.slice(0, -1) : rule;
    const literal = core.split("*")[0]; // prefix up to the first wildcard
    if (!path.startsWith(literal)) return -1;
    if (hasEnd && !core.includes("*") && path !== core) return -1;
    return literal.length;
  };

  let bestAllow = -1;
  let bestDisallow = -1;
  for (const a of group.allow) bestAllow = Math.max(bestAllow, match(a));
  for (const d of group.disallow) bestDisallow = Math.max(bestDisallow, match(d));

  if (bestDisallow === -1) return true;
  // Allow wins ties (more permissive), per Google's implementation.
  return bestAllow >= bestDisallow;
}

const ALLOW_ALL: RobotsRules = { isAllowed: () => true };

/**
 * Fetch https://<host>/robots.txt and parse it for our UA. Fails OPEN on any
 * network/parse error or non-200 (no robots.txt ⇒ crawl allowed). `host` is the
 * bare hostname of the sitemap; the robots URL is built from it (https).
 */
export async function loadRobots(host: string): Promise<RobotsRules> {
  let robotsUrl: string;
  try {
    const { host: safeHost } = assertUrlAllowed(`https://${host}/robots.txt`);
    await assertHostResolvesPublic(safeHost);
    robotsUrl = `https://${safeHost}/robots.txt`;
  } catch {
    return ALLOW_ALL;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(robotsUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, accept: "text/plain" },
    });
    if (!res.ok) return ALLOW_ALL;
    const text = await res.text();
    return parseRobots(text);
  } catch {
    return ALLOW_ALL;
  } finally {
    clearTimeout(timer);
  }
}
