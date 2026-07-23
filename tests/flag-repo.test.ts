// Pure mapper tests for the admin FlagRepo — no DB. These pin the row→read-model
// contract: category/status passthrough, ISO timestamp conversion, null-safe
// resolvedAt, and the joined context fields. All fixtures are hand-built.

import { describe, it, expect } from "vitest";
import {
  mapFlagRow,
  mapFlagWithContext,
  type FlagQueryRow,
  type FlagContextRow,
} from "@/lib/admin/flag-repo";

describe("mapFlagRow", () => {
  const base: FlagQueryRow = {
    id: "f-1",
    message_id: "m-assistant-1",
    category: "hallucination",
    note: "invented a price the KB never states",
    status: "open",
    created_at: new Date("2026-07-23T10:00:00.000Z"),
    resolved_at: null,
  };

  it("passes category and status straight across", () => {
    const f = mapFlagRow(base);
    expect(f.category).toBe("hallucination");
    expect(f.status).toBe("open");
  });

  it("maps identity fields straight across", () => {
    const f = mapFlagRow(base);
    expect(f.id).toBe("f-1");
    expect(f.messageId).toBe("m-assistant-1");
    expect(f.note).toBe("invented a price the KB never states");
  });

  it("converts createdAt to an ISO string", () => {
    expect(mapFlagRow(base).createdAt).toBe("2026-07-23T10:00:00.000Z");
  });

  it("normalizes ISO-string timestamps too (driver-agnostic)", () => {
    const f = mapFlagRow({ ...base, created_at: "2026-07-23T10:00:00.000Z" });
    expect(f.createdAt).toBe("2026-07-23T10:00:00.000Z");
  });

  it("keeps a null resolved_at as null", () => {
    expect(mapFlagRow(base).resolvedAt).toBeNull();
  });

  it("converts a set resolved_at to an ISO string", () => {
    const f = mapFlagRow({
      ...base,
      status: "resolved",
      resolved_at: new Date("2026-07-23T11:30:00.000Z"),
    });
    expect(f.resolvedAt).toBe("2026-07-23T11:30:00.000Z");
  });
});

describe("mapFlagWithContext", () => {
  const base: FlagContextRow = {
    id: "f-2",
    message_id: "m-assistant-2",
    category: "missed_escalation",
    note: "should have offered a human handoff",
    status: "triaged",
    created_at: new Date("2026-07-23T10:00:00.000Z"),
    resolved_at: null,
    conversation_id: "c-1",
    query_text: "can I speak to a person?",
    mode: "answer",
    assistant_content: "Here is what I found in the docs...",
  };

  it("includes the base flag fields (via mapFlagRow)", () => {
    const f = mapFlagWithContext(base);
    expect(f.id).toBe("f-2");
    expect(f.category).toBe("missed_escalation");
    expect(f.status).toBe("triaged");
    expect(f.createdAt).toBe("2026-07-23T10:00:00.000Z");
    expect(f.resolvedAt).toBeNull();
  });

  it("adds the joined conversation + trace context fields", () => {
    const f = mapFlagWithContext(base);
    expect(f.conversationId).toBe("c-1");
    expect(f.queryText).toBe("can I speak to a person?");
    expect(f.mode).toBe("answer");
    expect(f.assistantContent).toBe("Here is what I found in the docs...");
  });
});
