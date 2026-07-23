// Pure mapper tests for the admin ClientRepo — no DB. Pins the row→ClientSummary
// contract: count coercion (bigint arrives as a string), ISO conversion of the
// last-activity timestamp, and null-safety when a tenant has no logged turns.

import { describe, it, expect } from "vitest";
import { mapClientRow, type ClientQueryRow } from "@/lib/admin/client-repo";

describe("mapClientRow", () => {
  const base: ClientQueryRow = {
    client_id: "acme",
    count: 12,
    last_at: new Date("2026-07-23T10:05:30.000Z"),
  };

  it("maps the tenant id straight across", () => {
    expect(mapClientRow(base).id).toBe("acme");
  });

  it("coerces a string count (bigint from the driver) to a number", () => {
    const s = mapClientRow({ ...base, count: "12" });
    expect(s.conversationCount).toBe(12);
    expect(typeof s.conversationCount).toBe("number");
  });

  it("keeps a numeric count as a number", () => {
    expect(mapClientRow(base).conversationCount).toBe(12);
  });

  it("converts a Date last_at to an ISO string", () => {
    expect(mapClientRow(base).lastActivityAt).toBe("2026-07-23T10:05:30.000Z");
  });

  it("normalizes an ISO-string last_at too (driver-agnostic)", () => {
    const s = mapClientRow({ ...base, last_at: "2026-07-23T10:05:30.000Z" });
    expect(s.lastActivityAt).toBe("2026-07-23T10:05:30.000Z");
  });

  it("keeps a null last_at as null (tenant with no logged turns)", () => {
    expect(mapClientRow({ ...base, last_at: null }).lastActivityAt).toBeNull();
  });
});
