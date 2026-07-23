// Client-owned session identity + local conversation history. The server's
// `cadre_sid` cookie is SameSite=Lax and cannot group a widget's cross-site
// turns (and third-party cookies are being phased out), so the widget mints
// and owns its own `sessionId`, persisted per HOST ORIGIN so multiple sites
// embedding the widget never mix sessions
// (docs/product/client-rollout-features.md § A "Session identity across origins").

const SESSION_KEY_PREFIX = "cadre_widget_sid::";
const HISTORY_KEY_PREFIX = "cadre_widget_history::";
// Mirrors the server's BodySchema `messages` cap (app/api/chat/route.ts).
const MAX_HISTORY_MESSAGES = 40;

export type StoredMessage = { role: "user" | "assistant"; content: string };

function storageKey(prefix: string): string {
  return `${prefix}${window.location.origin}`;
}

/** Get (or mint + persist) this browser's widget session id. Falls back to a
 * throwaway id if localStorage is unavailable (private mode, quota, etc.) —
 * the chat still works, it just won't group across reloads. */
export function getOrCreateSessionId(): string {
  const key = storageKey(SESSION_KEY_PREFIX);
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    window.localStorage.setItem(key, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function isStoredMessage(value: unknown): value is StoredMessage {
  if (!value || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  return (m.role === "user" || m.role === "assistant") && typeof m.content === "string";
}

/** Restore the last conversation for this host origin, or []. Never throws. */
export function loadHistory(): StoredMessage[] {
  try {
    const raw = window.localStorage.getItem(storageKey(HISTORY_KEY_PREFIX));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredMessage);
  } catch {
    return [];
  }
}

/** Persist the conversation (bounded), best-effort. Never throws. */
export function saveHistory(messages: readonly StoredMessage[]): void {
  try {
    const bounded = messages.slice(-MAX_HISTORY_MESSAGES);
    window.localStorage.setItem(storageKey(HISTORY_KEY_PREFIX), JSON.stringify(bounded));
  } catch {
    // Best-effort only — a full quota or disabled storage should not break chat.
  }
}
