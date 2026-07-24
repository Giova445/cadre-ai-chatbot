// Phase 1 — turn logging. Called from the chat route via after()/waitUntil so it
// never blocks the stream. BEST-EFFORT: the whole body is wrapped in try/catch and
// this function NEVER throws or rejects — a logging failure can never break chat.
//
// One transaction writes: conversation upsert → user+assistant messages →
// retrieval_traces row → retrieval_chunks (the full ranked trace, incl.
// retrieved-but-not-cited). See lib/admin/contracts.ts for the frozen shapes.

import { getDb } from "@/lib/db";
import { CITATION_FLOOR } from "@/lib/admin/contracts";
import type { LogTurnInput, TraceChunkRow } from "@/lib/admin/contracts";
import type { Decision } from "@/lib/guardrail";
import type { Retrieved } from "@/lib/types";

const DEFAULT_CLIENT = "default";

// The system prompt (lib/prompt.ts) requires every grounded LLM answer to cite
// "(source: <filename>)", and the offline stub (lib/responses.ts groundedStub)
// always includes it too. Its absence is the reliable tell that the model
// declined in-band (the SCOPE rule) even though decide() deferred that call to
// the LLM online (guardrail.ts: a low-scoring-but-not-"weak" query like "what's
// the weather" or "hi there" clears the mode-aware 0.05 threshold, so decide()
// returns mode:"answer" and lets the model's own scope rule handle it).
const CITATION_RE = /\(source:\s*[^)]+\)/i;

/**
 * Reclassify a Decision for PERSISTENCE ONLY, using the final assistant text —
 * never the live decision, response bytes, or headers already sent to the user
 * (those are untouched; this runs after the stream has flushed). Fixes the admin
 * dashboard showing "Answered" for a turn whose actual reply politely declined
 * (e.g. an off-topic question that cleared the online threshold). PURE, no DB.
 */
export function classifyForTrace(decision: Decision, assistantMessage: string): Decision {
  if (decision.mode !== "answer") return decision;
  if (CITATION_RE.test(assistantMessage)) return decision;
  // Reuse "weak_retrieval" (not a new reason) — this is exactly the outcome
  // decide() would have produced offline for the same not-actually-grounded turn.
  return { ...decision, mode: "escalate", reason: "weak_retrieval", citations: [] };
}

/**
 * Map a retrieval result set to persisted trace-chunk rows. PURE (no DB) so it is
 * unit-testable in isolation. rank === array index; `cited` is true when the score
 * clears CITATION_FLOOR (mirrors the guardrail's citation floor).
 */
export function deriveChunkRows(results: Retrieved[]): TraceChunkRow[] {
  return results.map((r, index) => ({
    chunkId: r.chunk.id,
    source: r.chunk.meta.source,
    section: r.chunk.meta.section,
    title: r.chunk.meta.title,
    tags: r.chunk.meta.tags,
    score: r.score,
    rank: index,
    cited: r.score >= CITATION_FLOOR,
  }));
}

/**
 * Persist one chat turn (user + assistant) with its full retrieval trace.
 * Best-effort: on ANY error, logs and returns — never throws/rejects.
 */
export async function logTurn(input: LogTurnInput): Promise<void> {
  try {
    const clientId = input.clientId ?? DEFAULT_CLIENT;
    const {
      sessionId,
      userMessage,
      assistantMessage,
      query,
      decision,
      results,
      embedderModel,
      backend,
      threshold,
    } = input;

    const sql = getDb();

    await sql.begin(async (tx) => {
      // 1. Upsert the conversation. A turn adds 2 messages; new conversations
      //    start at 2. base = turn_index of the new user message (assistant = +1).
      const [conversation] = await tx`
        insert into conversations (client_id, session_id, message_count, last_mode)
        values (${clientId}, ${sessionId}, 2, ${decision.mode})
        on conflict (client_id, session_id) do update
          set message_count = conversations.message_count + 2,
              last_at = now(),
              last_mode = ${decision.mode}
        returning id, message_count
      `;
      const conversationId = conversation.id;
      const base = Number(conversation.message_count) - 2;

      // 2. Insert the user + assistant messages; capture the assistant id.
      await tx`
        insert into messages (conversation_id, turn_index, role, content)
        values (${conversationId}, ${base}, 'user', ${userMessage})
      `;
      const [assistant] = await tx`
        insert into messages (conversation_id, turn_index, role, content)
        values (${conversationId}, ${base + 1}, 'assistant', ${assistantMessage})
        returning id
      `;
      const assistantMessageId = assistant.id;

      // 3. Insert the retrieval trace for the assistant message.
      const [trace] = await tx`
        insert into retrieval_traces
          (message_id, query_text, mode, reason, top_score, coverage,
           threshold, embedder_model, backend)
        values
          (${assistantMessageId}, ${query}, ${decision.mode}, ${decision.reason},
           ${decision.topScore}, ${decision.coverage}, ${threshold},
           ${embedderModel}, ${backend})
        returning id
      `;
      const traceId = trace.id;

      // 4. Insert every retrieved chunk (ranked, incl. not-cited). The `postgres`
      //    lib serializes each JS string[] (tags) to text[] automatically.
      const chunkRows = deriveChunkRows(results);
      if (chunkRows.length > 0) {
        const dbRows = chunkRows.map((c) => ({
          trace_id: traceId,
          chunk_id: c.chunkId,
          source: c.source,
          section: c.section,
          title: c.title,
          tags: c.tags,
          score: c.score,
          rank: c.rank,
          cited: c.cited,
        }));
        await tx`insert into retrieval_chunks ${tx(dbRows)}`;
      }
    });
  } catch (err) {
    console.error("[trace] logTurn failed:", err);
    return;
  }
}
