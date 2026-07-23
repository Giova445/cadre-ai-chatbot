// Pure mapper tests for the admin StarterRepo — no DB. These pin the row→
// read-model contract (mapStarterRow) and the publicList shaping
// (publicStartersFromRows): disabled rows dropped, order preserved, and the
// shared sanitizeStarters() bounds applied. All fixtures are hand-built.

import { describe, it, expect } from "vitest";
import {
  mapStarterRow,
  publicStartersFromRows,
  type StarterQueryRow,
} from "@/lib/admin/starter-repo";
import { MAX_STARTERS, MAX_STARTER_LEN } from "@/lib/starters";

function row(over: Partial<StarterQueryRow> = {}): StarterQueryRow {
  return {
    id: "s-1",
    client_id: "default",
    position: 0,
    text: "What does Cadre AI do?",
    enabled: true,
    ...over,
  };
}

describe("mapStarterRow", () => {
  it("maps every field across to the read model", () => {
    const r = mapStarterRow(row({ id: "abc", client_id: "acme", position: 3, text: "Hi", enabled: false }));
    expect(r).toEqual({ id: "abc", clientId: "acme", position: 3, text: "Hi", enabled: false });
  });

  it("coerces a string position to a number (driver-agnostic)", () => {
    const r = mapStarterRow(row({ position: "5" }));
    expect(r.position).toBe(5);
    expect(typeof r.position).toBe("number");
  });
});

describe("publicStartersFromRows", () => {
  it("returns enabled rows' text in the order given", () => {
    const out = publicStartersFromRows([
      row({ id: "a", text: "First", position: 0 }),
      row({ id: "b", text: "Second", position: 1 }),
    ]);
    expect(out).toEqual(["First", "Second"]);
  });

  it("drops disabled rows", () => {
    const out = publicStartersFromRows([
      row({ id: "a", text: "Shown", enabled: true }),
      row({ id: "b", text: "Hidden", enabled: false }),
    ]);
    expect(out).toEqual(["Shown"]);
  });

  it("drops empty / whitespace-only labels (junk)", () => {
    const out = publicStartersFromRows([
      row({ id: "a", text: "  " }),
      row({ id: "b", text: "Real question" }),
    ]);
    expect(out).toEqual(["Real question"]);
  });

  it("trims and collapses internal whitespace to a single line", () => {
    const out = publicStartersFromRows([row({ text: "  Ask   about\n\npricing  " })]);
    expect(out).toEqual(["Ask about pricing"]);
  });

  it("dedupes case-insensitively (first spelling wins)", () => {
    const out = publicStartersFromRows([
      row({ id: "a", text: "Book a call" }),
      row({ id: "b", text: "book A CALL" }),
    ]);
    expect(out).toEqual(["Book a call"]);
  });

  it("caps the count at MAX_STARTERS", () => {
    const rows = Array.from({ length: MAX_STARTERS + 3 }, (_, i) =>
      row({ id: `s-${i}`, text: `Question ${i}`, position: i }),
    );
    expect(publicStartersFromRows(rows)).toHaveLength(MAX_STARTERS);
  });

  it("caps label length at MAX_STARTER_LEN", () => {
    const out = publicStartersFromRows([row({ text: "x".repeat(MAX_STARTER_LEN + 40) })]);
    expect(out[0]).toHaveLength(MAX_STARTER_LEN);
  });

  it("returns an empty list when nothing is enabled", () => {
    const out = publicStartersFromRows([
      row({ id: "a", enabled: false }),
      row({ id: "b", enabled: false }),
    ]);
    expect(out).toEqual([]);
  });

  it("does not mutate the input rows", () => {
    const rows = [row({ id: "a", text: "Keep me", enabled: true }), row({ id: "b", enabled: false })];
    const snapshot = JSON.parse(JSON.stringify(rows));
    publicStartersFromRows(rows);
    expect(rows).toEqual(snapshot);
  });
});
