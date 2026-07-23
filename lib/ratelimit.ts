// Best-effort in-memory sliding-window rate limiter — a cheap first line of
// defense against runaway LLM cost on the public /api/chat endpoint.
//
// LIMITATION: on serverless each instance has its own memory, so this caps abuse
// per-instance only. A real distributed limit needs a shared store (Upstash
// Redis) — that is the documented Tier-1 upgrade. Disable with
// RATE_LIMIT_PER_MIN=0.

const WINDOW_MS = 60_000;
const MAX = Number(process.env.RATE_LIMIT_PER_MIN ?? "30");
const hits = new Map<string, number[]>();

export function rateLimit(key: string): { ok: boolean; remaining: number } {
  if (!Number.isFinite(MAX) || MAX <= 0) return { ok: true, remaining: Infinity };
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= MAX) {
    hits.set(key, recent);
    return { ok: false, remaining: 0 };
  }

  recent.push(now);
  hits.set(key, recent);

  // Bound memory: prune stale keys once the map grows large.
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      const live = v.filter((t) => now - t < WINDOW_MS);
      if (live.length === 0) hits.delete(k);
      else hits.set(k, live);
    }
  }

  return { ok: true, remaining: MAX - recent.length };
}
