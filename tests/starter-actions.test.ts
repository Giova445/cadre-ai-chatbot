// Boundary-validation tests for the starter-question Server Action schemas. Like
// tests/actions.test.ts we test the exported Zod schemas directly — the actions
// (createStarter / … ) call requireAdmin() + revalidatePath(), which need a Next
// request context and can't run in a plain vitest env. The schema is the
// untrusted-input boundary, so it's the thing worth pinning here. Bounds mirror
// lib/starters.ts (MAX_STARTER_LEN = 120).

import { describe, it, expect } from "vitest";
import {
  createStarterSchema,
  updateStarterSchema,
  reorderStartersSchema,
  deleteStarterSchema,
} from "@/lib/admin/action-schemas";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_UUID_2 = "550e8400-e29b-41d4-a716-446655440001";

describe("createStarterSchema", () => {
  it("accepts a valid payload", () => {
    const result = createStarterSchema.safeParse({ clientId: "acme", text: "Book a demo" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ clientId: "acme", text: "Book a demo" });
  });

  it("defaults clientId to \"default\" when omitted", () => {
    const result = createStarterSchema.safeParse({ text: "What do you do?" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.clientId).toBe("default");
  });

  it("trims surrounding whitespace from text", () => {
    const result = createStarterSchema.safeParse({ text: "  padded  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.text).toBe("padded");
  });

  it("rejects empty and whitespace-only text", () => {
    expect(createStarterSchema.safeParse({ text: "" }).success).toBe(false);
    expect(createStarterSchema.safeParse({ text: "   " }).success).toBe(false);
  });

  it("accepts text of exactly 120 chars but rejects 121", () => {
    expect(createStarterSchema.safeParse({ text: "a".repeat(120) }).success).toBe(true);
    expect(createStarterSchema.safeParse({ text: "a".repeat(121) }).success).toBe(false);
  });

  it("rejects a clientId longer than 64 chars", () => {
    expect(createStarterSchema.safeParse({ clientId: "a".repeat(64), text: "x" }).success).toBe(true);
    expect(createStarterSchema.safeParse({ clientId: "a".repeat(65), text: "x" }).success).toBe(false);
  });
});

describe("updateStarterSchema", () => {
  it("accepts a text-only edit", () => {
    const result = updateStarterSchema.safeParse({ id: VALID_UUID, text: "New label" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ id: VALID_UUID, text: "New label" });
  });

  it("accepts an enabled-only edit", () => {
    const result = updateStarterSchema.safeParse({ id: VALID_UUID, enabled: false });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.enabled).toBe(false);
  });

  it("accepts both fields together", () => {
    const result = updateStarterSchema.safeParse({ id: VALID_UUID, text: "x", enabled: true });
    expect(result.success).toBe(true);
  });

  it("accepts an id-only (no-op) payload — both fields optional", () => {
    expect(updateStarterSchema.safeParse({ id: VALID_UUID }).success).toBe(true);
  });

  it("rejects a non-uuid id", () => {
    expect(updateStarterSchema.safeParse({ id: "starter-1", text: "x" }).success).toBe(false);
  });

  it("rejects empty text and text over 120 chars", () => {
    expect(updateStarterSchema.safeParse({ id: VALID_UUID, text: "" }).success).toBe(false);
    expect(updateStarterSchema.safeParse({ id: VALID_UUID, text: "a".repeat(121) }).success).toBe(false);
  });

  it("rejects a non-boolean enabled", () => {
    expect(updateStarterSchema.safeParse({ id: VALID_UUID, enabled: "yes" }).success).toBe(false);
  });
});

describe("reorderStartersSchema", () => {
  it("accepts a valid ordered id list", () => {
    const result = reorderStartersSchema.safeParse({
      clientId: "acme",
      orderedIds: [VALID_UUID, VALID_UUID_2],
    });
    expect(result.success).toBe(true);
  });

  it("defaults clientId to \"default\" when omitted", () => {
    const result = reorderStartersSchema.safeParse({ orderedIds: [VALID_UUID] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.clientId).toBe("default");
  });

  it("accepts an empty ordered list", () => {
    expect(reorderStartersSchema.safeParse({ orderedIds: [] }).success).toBe(true);
  });

  it("rejects a list containing a non-uuid", () => {
    expect(reorderStartersSchema.safeParse({ orderedIds: [VALID_UUID, "nope"] }).success).toBe(false);
  });

  it("accepts 50 ids but rejects 51", () => {
    const ids = Array.from({ length: 50 }, () => VALID_UUID);
    expect(reorderStartersSchema.safeParse({ orderedIds: ids }).success).toBe(true);
    expect(reorderStartersSchema.safeParse({ orderedIds: [...ids, VALID_UUID] }).success).toBe(false);
  });
});

describe("deleteStarterSchema", () => {
  it("accepts a valid uuid", () => {
    expect(deleteStarterSchema.safeParse({ id: VALID_UUID }).success).toBe(true);
  });

  it("rejects a non-uuid id", () => {
    expect(deleteStarterSchema.safeParse({ id: "starter-1" }).success).toBe(false);
  });
});
