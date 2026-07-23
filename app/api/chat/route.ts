// Streaming chat endpoint. Custom plain-text streaming protocol (no AI-SDK UI
// protocol coupling) so the app behaves identically offline (grounded stub) and
// online (streamed LLM answer). Guardrail/escalation metadata rides in headers.
// Cross-origin embeds (the widget) are gated by an origin allowlist + CORS, and
// runaway cost is capped by a best-effort rate limiter.

import { z } from "zod";
import { after } from "next/server";
import { getChatModel, hasChatModel, streamText } from "@/lib/llm";
import { retrieveText, EFFECTIVE_THRESHOLD, getKB } from "@/lib/kb";
import { decide } from "@/lib/guardrail";
import { buildSystem, buildConversation } from "@/lib/prompt";
import { groundedStub, responseForDecision } from "@/lib/responses";
import { corsHeaders, isOriginAllowed } from "@/lib/cors";
import { rateLimit } from "@/lib/ratelimit";
import { logTurn } from "@/lib/trace";
import { RETRIEVAL_BACKEND, EMBED_MODEL } from "@/lib/config";
import { SID_COOKIE } from "@/lib/admin/contracts";
import type { Decision } from "@/lib/guardrail";
import type { HistoryMessage, Retrieved } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Give the LLM stream headroom (safe on Vercel Hobby; raise on Pro if needed).
export const maxDuration = 60;

const BodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(40),
});

function encoderStream(text: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(text));
      controller.close();
    },
  });
}

function iterableStream(
  iter: AsyncIterable<string>,
  fallback: string,
  onComplete?: (full: string) => void,
): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      let any = false;
      let acc = "";
      try {
        for await (const delta of iter) {
          any = true;
          acc += delta;
          controller.enqueue(enc.encode(delta));
        }
        if (!any) {
          acc = fallback;
          controller.enqueue(enc.encode(fallback));
        }
      } catch (err) {
        // Before any token: fall back to the grounded stub. After partial
        // output: don't garble it with the stub — mark it interrupted so the
        // user (and logs) know it's incomplete rather than silently truncated.
        if (!any) {
          acc = fallback;
          controller.enqueue(enc.encode(fallback));
        } else {
          const marker = "\n\n_(response interrupted)_";
          acc += marker;
          controller.enqueue(enc.encode(marker));
        }
        console.error("[chat] stream error:", err);
      } finally {
        controller.close();
        // Hand the fully-accumulated assistant text to the (best-effort) logger.
        onComplete?.(acc);
      }
    },
  });
}

// CORS preflight for cross-origin widget embeds.
export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin, req.headers.get("host")),
  });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  const cors = corsHeaders(origin, host);

  // Cross-origin gate (browser only; non-browser abuse is caught by rate limit).
  if (!isOriginAllowed(origin, host)) {
    return new Response("Origin not allowed.", { status: 403, headers: cors });
  }

  // Best-effort abuse/cost cap (per-IP). Distributed limit = Tier-1 Upstash.
  const ip =
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!rateLimit(ip).ok) {
    return new Response("Rate limit exceeded. Please wait a moment.", {
      status: 429,
      headers: { ...cors, "Retry-After": "60" },
    });
  }

  let parsed: z.infer<typeof BodySchema>;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch {
    return new Response("Invalid request body.", { status: 400, headers: cors });
  }

  const messages = parsed.messages;
  const lastUserIdx = messages.map((m) => m.role).lastIndexOf("user");
  if (lastUserIdx === -1) {
    return new Response("No user message.", { status: 400, headers: cors });
  }
  const query = messages[lastUserIdx].content;
  // History = everything before the current user turn, so a trailing assistant
  // turn isn't answered as the query and the query isn't duplicated into context.
  const history: HistoryMessage[] = messages.slice(0, lastUserIdx).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // Group a visitor's turns into one conversation via a non-identifying,
  // httpOnly session id (minted on the first turn). Powers the admin trace view.
  const { sid, setCookie } = readOrCreateSid(req);

  let results;
  try {
    results = await retrieveText(query);
  } catch (err) {
    // Retrieval/embeddings failure -> escalate gracefully, never 500 with a leak.
    // Log it: a real artifact + a runtime key that can't embed silently turns
    // every query into an escalation, so this is the only misconfig signal.
    console.error("[chat] retrieval/embedding failed:", err);
    const errDecision: Decision = {
      mode: "escalate",
      reason: "weak_retrieval",
      citations: [],
      topScore: 0,
      coverage: 0,
    };
    const errText = responseForDecision(errDecision);
    scheduleTurnLog({ sid, query, assistantMessage: errText, decision: errDecision, results: [] });
    return streamed(
      errText,
      { mode: "escalate", reason: "embed_error", sources: [], topScore: 0 },
      cors,
      setCookie,
    );
  }
  const decision = decide(query, results, EFFECTIVE_THRESHOLD);
  const meta = {
    mode: decision.mode,
    reason: decision.reason,
    sources: decision.citations,
    topScore: decision.topScore,
  };

  // Non-answer paths are deterministic text — no model needed.
  if (decision.mode !== "answer") {
    const text = responseForDecision(decision);
    scheduleTurnLog({ sid, query, assistantMessage: text, decision, results });
    return streamed(text, meta, cors, setCookie);
  }

  // Answer path: real model when a key exists, else an offline grounded stub.
  const model = getChatModel();
  if (!hasChatModel() || !model) {
    const text = groundedStub(results);
    scheduleTurnLog({ sid, query, assistantMessage: text, decision, results });
    return streamed(text, { ...meta, reason: "grounded_offline" }, cors, setCookie);
  }

  try {
    const result = streamText({
      model,
      // System prompt + retrieved context go in `system` (Chat Completions maps
      // it); `messages` carries only user/assistant turns, so multi-turn history
      // is preserved without an illegal system message.
      system: buildSystem(results),
      messages: buildConversation({ query, history }),
      // Stop consuming (and billing) the provider if the client disconnects.
      abortSignal: req.signal,
      // Provider/network errors surface here (the textStream swallows them), so
      // this is the reliable operational signal for mid-stream failures.
      onError: ({ error }) => console.error("[chat] stream error:", error),
    });
    let resolveText!: (full: string) => void;
    const assistantText = new Promise<string>((resolve) => {
      resolveText = resolve;
    });
    const body = iterableStream(result.textStream, groundedStub(results), resolveText);
    scheduleTurnLog({ sid, query, assistantMessage: assistantText, decision, results });
    return new Response(body, { headers: metaHeaders(meta, cors, setCookie) });
  } catch (err) {
    // Synchronous streamText failure -> still return grounded context. (Provider
    // errors surface during stream iteration; see the iterableStream fallback.)
    console.error("[chat] chat model failed:", err);
    const text = groundedStub(results);
    scheduleTurnLog({ sid, query, assistantMessage: text, decision, results });
    return streamed(text, { ...meta, reason: "grounded_fallback" }, cors, setCookie);
  }
}

type Meta = { mode: string; reason: string; sources: string[]; topScore: number };

function metaHeaders(
  meta: Meta,
  cors: Record<string, string>,
  setCookie?: string,
): HeadersInit {
  const headers: Record<string, string> = {
    ...cors,
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "x-cadre-mode": meta.mode,
    "x-cadre-reason": meta.reason,
    "x-cadre-sources": JSON.stringify(meta.sources),
    "x-cadre-topscore": meta.topScore.toFixed(4),
  };
  if (setCookie) headers["Set-Cookie"] = setCookie;
  return headers;
}

function streamed(
  text: string,
  meta: Meta,
  cors: Record<string, string>,
  setCookie?: string,
): Response {
  return new Response(encoderStream(text), {
    headers: metaHeaders(meta, cors, setCookie),
  });
}

// The retrieval embedder recorded on every trace (pgvector always embeds queries
// with the real model; the bundle backend follows its artifact).
const TRACE_EMBEDDER =
  RETRIEVAL_BACKEND === "pgvector" ? EMBED_MODEL : getKB().model;

// Read the visitor's `cadre_sid` cookie, or mint one (returned as a Set-Cookie).
function readOrCreateSid(req: Request): { sid: string; setCookie?: string } {
  const raw = req.headers.get("cookie") ?? "";
  const match = raw.match(new RegExp(`(?:^|;\\s*)${SID_COOKIE}=([^;]+)`));
  if (match) return { sid: decodeURIComponent(match[1]) };
  const sid = crypto.randomUUID();
  const setCookie = `${SID_COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=31536000`;
  return { sid, setCookie };
}

// Best-effort turn logging, scheduled AFTER the response flushes (never blocks
// the stream). `assistantMessage` may be a promise — the LLM path resolves it
// when the stream closes. logTurn itself swallows all errors.
function scheduleTurnLog(args: {
  sid: string;
  query: string;
  assistantMessage: string | Promise<string>;
  decision: Decision;
  results: Retrieved[];
}): void {
  after(async () => {
    const assistantMessage = await args.assistantMessage;
    await logTurn({
      sessionId: args.sid,
      userMessage: args.query,
      assistantMessage,
      query: args.query,
      decision: args.decision,
      results: args.results,
      embedderModel: TRACE_EMBEDDER,
      backend: RETRIEVAL_BACKEND,
      threshold: EFFECTIVE_THRESHOLD,
    });
  });
}
