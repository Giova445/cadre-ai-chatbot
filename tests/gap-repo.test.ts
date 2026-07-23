// Pure mapper test for the admin GapRepo — no DB. Pins the row→read-model
// contract: defensive Number() coercion of top_score/coverage, ISO timestamp
// conversion, and the flagged boolean passthrough. All fixtures are hand-built.

import { describe, it, expect } from "vitest";
import { mapGapRow, type GapQueryRow } from "@/lib/admin/gap-repo";

describe("mapGapRow", () => {
  const base: GapQueryRow = {
    trace_id: "t-1",
    message_id: "m-assistant-1",
    conversation_id: "c-1",
    query_text: "what's your pricing?",
    mode: "refuse",
    reason: "pricing_guard",
    top_score: 0.12,
    coverage: 0,
    created_at: new Date("2026-07-23T10:00:00.000Z"),
    flagged: false,
  };

  it("maps identity + context fields straight across", () => {
    const g = mapGapRow(base);
    expect(g.traceId).toBe("t-1");
    expect(g.messageId).toBe("m-assistant-1");
    expect(g.conversationId).toBe("c-1");
    expect(g.queryText).toBe("what's your pricing?");
    expect(g.mode).toBe("refuse");
    expect(g.reason).toBe("pricing_guard");
  });

  it("coerces string-typed numeric columns to numbers", () => {
    const g = mapGapRow({ ...base, top_score: "0.12", coverage: "0.5" });
    expect(g.topScore).toBe(0.12);
    expect(g.coverage).toBe(0.5);
    expect(typeof g.topScore).toBe("number");
    expect(typeof g.coverage).toBe("number");
  });

  it("keeps numeric top_score/coverage as numbers", () => {
    const g = mapGapRow(base);
    expect(g.topScore).toBe(0.12);
    expect(g.coverage).toBe(0);
  });

  it("passes the flagged boolean through unchanged", () => {
    expect(mapGapRow(base).flagged).toBe(false);
    expect(mapGapRow({ ...base, flagged: true }).flagged).toBe(true);
  });

  it("converts createdAt to an ISO string", () => {
    expect(mapGapRow(base).createdAt).toBe("2026-07-23T10:00:00.000Z");
  });

  it("normalizes ISO-string timestamps too (driver-agnostic)", () => {
    const g = mapGapRow({ ...base, created_at: "2026-07-23T10:00:00.000Z" });
    expect(g.createdAt).toBe("2026-07-23T10:00:00.000Z");
  });
});
