// Boundary-validation tests for the admin flagging Server Actions. We test the
// exported Zod schemas directly — the actions themselves (createFlag /
// updateFlagStatus) call requireAdmin() + revalidatePath(), which need a Next
// request context, so they can't be invoked in a plain vitest env. The schema is
// the untrusted-input boundary, so it's the thing worth pinning here.

import { describe, it, expect } from "vitest";
import { createFlagSchema, updateFlagStatusSchema } from "@/lib/admin/action-schemas";
import { FLAG_CATEGORIES, FLAG_STATUSES } from "@/lib/admin/contracts";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("createFlagSchema", () => {
  it("accepts a valid payload", () => {
    const result = createFlagSchema.safeParse({
      messageId: VALID_UUID,
      category: "hallucination",
      note: "invented a price",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        messageId: VALID_UUID,
        category: "hallucination",
        note: "invented a price",
      });
    }
  });

  it("defaults note to \"\" when omitted", () => {
    const result = createFlagSchema.safeParse({
      messageId: VALID_UUID,
      category: "tone",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.note).toBe("");
  });

  it("accepts every frozen category", () => {
    for (const category of FLAG_CATEGORIES) {
      const result = createFlagSchema.safeParse({ messageId: VALID_UUID, category });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an unknown category", () => {
    const result = createFlagSchema.safeParse({
      messageId: VALID_UUID,
      category: "not_a_category",
      note: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid messageId", () => {
    const result = createFlagSchema.safeParse({
      messageId: "message-123",
      category: "other",
      note: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a note of exactly 1000 chars but rejects 1001", () => {
    const base = { messageId: VALID_UUID, category: "incomplete" as const };
    expect(createFlagSchema.safeParse({ ...base, note: "a".repeat(1000) }).success).toBe(true);
    expect(createFlagSchema.safeParse({ ...base, note: "a".repeat(1001) }).success).toBe(false);
  });
});

describe("updateFlagStatusSchema", () => {
  it("accepts every frozen status", () => {
    for (const status of FLAG_STATUSES) {
      const result = updateFlagStatusSchema.safeParse({ id: VALID_UUID, status });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an unknown status", () => {
    const result = updateFlagStatusSchema.safeParse({ id: VALID_UUID, status: "archived" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid id", () => {
    const result = updateFlagStatusSchema.safeParse({ id: "flag-1", status: "resolved" });
    expect(result.success).toBe(false);
  });
});
