// Pure mapper tests for the admin ConversationRepo — no DB. These pin the
// row→read-model contract: ISO timestamp conversion, defensive numeric
// coercion, null-safety, and rank ordering. All fixtures are hand-built.

import { describe, it, expect } from "vitest";
import {
  mapConversationRow,
  mapTraceRow,
  type ConversationListRow,
  type TraceQueryRow,
  type TraceChunkQueryRow,
} from "@/lib/admin/repos";

describe("mapConversationRow", () => {
  const base: ConversationListRow = {
    id: "c-1",
    session_id: "sess-abc",
    started_at: new Date("2026-07-23T10:00:00.000Z"),
    last_at: new Date("2026-07-23T10:05:30.000Z"),
    last_mode: "answer",
    message_count: 4,
    first_question: "What services do you offer?",
  };

  it("converts Date timestamps to ISO strings", () => {
    const s = mapConversationRow(base);
    expect(s.startedAt).toBe("2026-07-23T10:00:00.000Z");
    expect(s.lastAt).toBe("2026-07-23T10:05:30.000Z");
  });

  it("normalizes ISO-string timestamps too (driver-agnostic)", () => {
    const s = mapConversationRow({
      ...base,
      started_at: "2026-07-23T10:00:00.000Z",
      last_at: "2026-07-23T10:05:30.000Z",
    });
    expect(s.startedAt).toBe("2026-07-23T10:00:00.000Z");
    expect(s.lastAt).toBe("2026-07-23T10:05:30.000Z");
  });

  it("passes a null last_mode through unchanged", () => {
    expect(mapConversationRow({ ...base, last_mode: null }).lastMode).toBeNull();
  });

  it("defaults a missing first user message to an empty string", () => {
    expect(mapConversationRow({ ...base, first_question: null }).firstQuestion).toBe("");
  });

  it("coerces a string message_count to a number", () => {
    expect(mapConversationRow({ ...base, message_count: "7" }).messageCount).toBe(7);
  });

  it("maps identity fields straight across", () => {
    const s = mapConversationRow(base);
    expect(s.id).toBe("c-1");
    expect(s.sessionId).toBe("sess-abc");
    expect(s.firstQuestion).toBe("What services do you offer?");
  });
});

describe("mapTraceRow", () => {
  const trace: TraceQueryRow = {
    id: "t-1",
    message_id: "m-assistant-1",
    query_text: "pricing?",
    mode: "refuse",
    reason: "pricing_guard",
    top_score: 0.42,
    coverage: 0.5,
    threshold: 0.3,
    embedder_model: "text-embedding-3-small",
    backend: "pgvector",
    created_at: new Date("2026-07-23T10:05:00.000Z"),
  };

  const chunk = (over: Partial<TraceChunkQueryRow>): TraceChunkQueryRow => ({
    trace_id: "t-1",
    chunk_id: "services.md#0",
    source: "services.md",
    section: "Overview",
    title: "Services",
    tags: ["ai"],
    score: 0.4,
    rank: 1,
    cited: true,
    ...over,
  });

  it("orders chunks by rank ascending regardless of input order", () => {
    const t = mapTraceRow(trace, [
      chunk({ chunk_id: "b", rank: 2, cited: false }),
      chunk({ chunk_id: "a", rank: 1, cited: true }),
      chunk({ chunk_id: "c", rank: 3, cited: false }),
    ]);
    expect(t.chunks.map((c) => c.chunkId)).toEqual(["a", "b", "c"]);
    expect(t.chunks.map((c) => c.rank)).toEqual([1, 2, 3]);
  });

  it("does not mutate the caller's chunk array", () => {
    const input = [chunk({ chunk_id: "b", rank: 2 }), chunk({ chunk_id: "a", rank: 1 })];
    mapTraceRow(trace, input);
    expect(input.map((c) => c.chunk_id)).toEqual(["b", "a"]);
  });

  it("coerces string-typed numeric columns on the trace and chunks", () => {
    const t = mapTraceRow(
      { ...trace, top_score: "0.42", coverage: "0.5", threshold: "0.3" },
      [chunk({ score: "0.71" as unknown as number, rank: "2" as unknown as number })],
    );
    expect(t.topScore).toBe(0.42);
    expect(t.coverage).toBe(0.5);
    expect(t.threshold).toBe(0.3);
    expect(t.chunks[0].score).toBe(0.71);
    expect(t.chunks[0].rank).toBe(2);
    expect(typeof t.chunks[0].score).toBe("number");
  });

  it("passes the cited flag through unchanged", () => {
    const t = mapTraceRow(trace, [
      chunk({ chunk_id: "a", rank: 1, cited: true }),
      chunk({ chunk_id: "b", rank: 2, cited: false }),
    ]);
    expect(t.chunks.map((c) => c.cited)).toEqual([true, false]);
  });

  it("coalesces null tags to an empty array", () => {
    const t = mapTraceRow(trace, [chunk({ tags: null })]);
    expect(t.chunks[0].tags).toEqual([]);
  });

  it("converts the trace timestamp to ISO and keys off message_id", () => {
    const t = mapTraceRow(trace, []);
    expect(t.createdAt).toBe("2026-07-23T10:05:00.000Z");
    expect(t.messageId).toBe("m-assistant-1");
    expect(t.chunks).toEqual([]);
  });
});
