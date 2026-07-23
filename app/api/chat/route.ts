// Streaming chat endpoint. Custom plain-text streaming protocol (no AI-SDK UI
// protocol coupling) so the app behaves identically offline (grounded stub) and
// online (streamed LLM answer). Guardrail/escalation metadata rides in headers.

import { z } from "zod";
import { embedQuery, getChatModel, hasChatModel, streamText } from "@/lib/llm";
import { retrieve } from "@/lib/kb";
import { decide } from "@/lib/guardrail";
import { buildSystem, buildConversation } from "@/lib/prompt";
import { groundedStub, responseForDecision } from "@/lib/responses";
import type { HistoryMessage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      let any = false;
      try {
        for await (const delta of iter) {
          any = true;
          controller.enqueue(enc.encode(delta));
        }
        if (!any) controller.enqueue(enc.encode(fallback));
      } catch {
        // Only fall back if nothing streamed yet — never append the stub onto
        // a partially-streamed answer (which would read as garbled).
        if (!any) controller.enqueue(enc.encode(fallback));
      } finally {
        controller.close();
      }
    },
  });
}

export async function POST(req: Request) {
  let parsed: z.infer<typeof BodySchema>;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch {
    return new Response("Invalid request body.", { status: 400 });
  }

  const messages = parsed.messages;
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return new Response("No user message.", { status: 400 });
  const query = lastUser.content;
  const history: HistoryMessage[] = messages.slice(0, -1).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let queryVec: number[];
  try {
    queryVec = await embedQuery(query);
  } catch {
    // Embeddings failure -> escalate gracefully, never 500 with a leak.
    return streamed(
      responseForDecision({
        mode: "escalate",
        reason: "weak_retrieval",
        citations: [],
        topScore: 0,
        coverage: 0,
      }),
      { mode: "escalate", reason: "embed_error", sources: [], topScore: 0 },
    );
  }

  const results = retrieve(queryVec);
  const decision = decide(query, results);
  const meta = {
    mode: decision.mode,
    reason: decision.reason,
    sources: decision.citations,
    topScore: decision.topScore,
  };

  // Non-answer paths are deterministic text — no model needed.
  if (decision.mode !== "answer") {
    return streamed(responseForDecision(decision), meta);
  }

  // Answer path: real model when a key exists, else an offline grounded stub.
  const model = getChatModel();
  if (!hasChatModel() || !model) {
    return streamed(groundedStub(results), { ...meta, reason: "grounded_offline" });
  }

  try {
    const result = streamText({
      model,
      // System prompt + retrieved context go in `system` (Responses API requires
      // this); `messages` carries only user/assistant turns, so multi-turn
      // history is preserved without an illegal system message.
      system: buildSystem(results),
      messages: buildConversation({ query, history }),
    });
    return new Response(
      iterableStream(result.textStream, groundedStub(results)),
      { headers: metaHeaders(meta) },
    );
  } catch {
    // Model failure -> still return grounded context we already retrieved.
    return streamed(groundedStub(results), { ...meta, reason: "grounded_fallback" });
  }
}

type Meta = { mode: string; reason: string; sources: string[]; topScore: number };

function metaHeaders(meta: Meta): HeadersInit {
  return {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "x-cadre-mode": meta.mode,
    "x-cadre-reason": meta.reason,
    "x-cadre-sources": JSON.stringify(meta.sources),
    "x-cadre-topscore": meta.topScore.toFixed(4),
  };
}

function streamed(text: string, meta: Meta): Response {
  return new Response(encoderStream(text), { headers: metaHeaders(meta) });
}
