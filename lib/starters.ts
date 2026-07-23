// Shared source of truth for starter / suggested question chips. PURE — no React,
// no DOM, no DB — so it is safe to import in the React app AND bundle into the
// vanilla widget. One definition + one sanitizer + one precedence rule; two
// renderers consume it (app/page.tsx, and the widget panel when built).

export const MAX_STARTERS = 6;
export const MAX_STARTER_LEN = 120;

export const DEFAULT_STARTERS: readonly string[] = [
  "What does Cadre AI do?",
  "What services do you offer?",
  "What is the AI Maturity Index?",
  "How do you choose LLMs and keep our data secure?",
  "How do I book a strategy call?",
  "How do I access the client portal?",
];

/**
 * Coerce arbitrary input to a safe, bounded, deduped list of chip labels. Never
 * throws. Collapses whitespace (a chip is one line), trims, caps length + count,
 * dedupes case-insensitively. Non-arrays and non-string items are dropped.
 */
export function sanitizeStarters(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const text = raw.replace(/\s+/g, " ").trim().slice(0, MAX_STARTER_LEN);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= MAX_STARTERS) break;
  }
  return out;
}

/**
 * Precedence: snippet (maker) → serverConfig (per-client) → DEFAULT_STARTERS.
 * `null`/`undefined` at a tier = unset (fall through). An explicit `[]` = "no
 * chips" (honored). A non-empty tier that sanitizes to nothing (all junk) falls
 * through. Falling all the way through yields the built-in defaults (never empty).
 */
export function resolveStarters(sources: {
  snippet?: string[] | null;
  serverConfig?: string[] | null;
}): string[] {
  for (const tier of [sources.snippet, sources.serverConfig]) {
    if (tier == null) continue; // unset → fall through
    if (tier.length === 0) return []; // explicit "no chips" → honored
    const cleaned = sanitizeStarters(tier);
    if (cleaned.length > 0) return cleaned; // valid maker list
    // non-empty but all-junk → treat as unset, fall through
  }
  return sanitizeStarters(DEFAULT_STARTERS);
}
