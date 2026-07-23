import { describe, it, expect } from "vitest";
import {
  sanitizeStarters,
  resolveStarters,
  DEFAULT_STARTERS,
  MAX_STARTERS,
  MAX_STARTER_LEN,
} from "@/lib/starters";

describe("sanitizeStarters", () => {
  it("drops non-strings/empties, trims, collapses whitespace", () => {
    expect(sanitizeStarters(["  hi  ", "", 5, null, "a\n\nb"])).toEqual(["hi", "a b"]);
  });
  it("dedupes case-insensitively (keeps first)", () => {
    expect(sanitizeStarters(["Hi", "hi", "HI"])).toEqual(["Hi"]);
  });
  it("caps count at MAX_STARTERS", () => {
    const many = Array.from({ length: 20 }, (_, i) => `q${i}`);
    expect(sanitizeStarters(many)).toHaveLength(MAX_STARTERS);
  });
  it("bounds each label at MAX_STARTER_LEN", () => {
    const [only] = sanitizeStarters(["a".repeat(500)]);
    expect(only.length).toBe(MAX_STARTER_LEN);
  });
  it("returns [] for a non-array", () => {
    expect(sanitizeStarters("nope")).toEqual([]);
  });
});

describe("resolveStarters", () => {
  const defaults = sanitizeStarters(DEFAULT_STARTERS);
  it("falls through unset tiers to defaults", () => {
    expect(resolveStarters({})).toEqual(defaults);
    expect(resolveStarters({ snippet: null, serverConfig: null })).toEqual(defaults);
  });
  it("honors an explicit empty snippet (no chips)", () => {
    expect(resolveStarters({ snippet: [] })).toEqual([]);
  });
  it("snippet overrides serverConfig", () => {
    expect(resolveStarters({ snippet: ["a"], serverConfig: ["b"] })).toEqual(["a"]);
  });
  it("uses serverConfig when snippet is unset", () => {
    expect(resolveStarters({ serverConfig: ["b"] })).toEqual(["b"]);
  });
  it("non-empty but all-junk falls through to defaults", () => {
    expect(resolveStarters({ snippet: ["", "   "] })).toEqual(defaults);
  });
});
