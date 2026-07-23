// Wire protocol client — mirrors app/page.tsx's consumption of /api/chat
// EXACTLY: POST JSON, read the streamed `text/plain` body with a
// ReadableStream reader + TextDecoder, and read the four `x-cadre-*` headers
// that drive escalation UI. The one difference from the first-party app: the
// widget also sends `client` + `sessionId` in the body (see
// docs/product/client-rollout-features.md § A "Transport and data flow").

import type { WidgetConfig } from "./config";
import type { StoredMessage } from "./session";

export type ChatMeta = {
  mode: string; // "answer" | "refuse" | "escalate"
  reason: string;
  sources: string[];
  topScore: number;
};

export type StreamHandlers = {
  /** Called with the full accumulated text after each chunk. */
  onDelta: (fullTextSoFar: string) => void;
  /** Called once, after the stream closes successfully. */
  onDone: (fullText: string, meta: ChatMeta) => void;
  /** Called on network failure or a non-OK response; `message` is user-facing. */
  onError: (message: string) => void;
};

function parseSources(raw: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function readMeta(res: Response): ChatMeta {
  return {
    mode: res.headers.get("x-cadre-mode") ?? "answer",
    reason: res.headers.get("x-cadre-reason") ?? "",
    sources: parseSources(res.headers.get("x-cadre-sources")),
    topScore: Number(res.headers.get("x-cadre-topscore")) || 0,
  };
}

/**
 * POST the conversation to `${cfg.apiBase}/api/chat` and stream the plain-text
 * response. `messages` is the full outgoing turn list (role/content only —
 * the server infers the query from the last user message).
 */
export async function sendMessage(
  cfg: WidgetConfig,
  messages: readonly StoredMessage[],
  sessionId: string,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${cfg.apiBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, client: cfg.client, sessionId }),
      signal,
    });
  } catch {
    handlers.onError("Sorry, the network dropped. Please try again.");
    return;
  }

  const meta = readMeta(res);

  if (!res.ok || !res.body) {
    handlers.onError("Sorry, something went wrong. Please try again.");
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let acc = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += decoder.decode(value, { stream: true });
      handlers.onDelta(acc);
    }
  } catch {
    handlers.onError("Sorry, the network dropped. Please try again.");
    return;
  }
  handlers.onDone(acc, meta);
}
