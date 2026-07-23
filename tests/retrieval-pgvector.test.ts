import { describe, it, expect } from "vitest";
import { vectorLiteral, rowToRetrieved, type PgChunkRow } from "@/lib/retrieval-pgvector";

describe("vectorLiteral", () => {
  it("formats a vector as a pgvector text literal", () => {
    expect(vectorLiteral([0.1, -0.2, 0.3])).toBe("[0.1,-0.2,0.3]");
  });
  it("handles an empty vector", () => {
    expect(vectorLiteral([])).toBe("[]");
  });
});

describe("rowToRetrieved", () => {
  const base: PgChunkRow = {
    id: "services.md#2",
    source: "services.md",
    title: "Services",
    section: "Engineering",
    tags: ["ai", "eng"],
    text: "Services | Engineering\nWe build agents.",
    score: 0.7421,
  };

  it("maps a DB row to the Retrieved contract", () => {
    const r = rowToRetrieved(base);
    expect(r.chunk.id).toBe("services.md#2");
    expect(r.chunk.meta).toEqual({
      source: "services.md",
      title: "Services",
      section: "Engineering",
      tags: ["ai", "eng"],
    });
    expect(r.chunk.text).toContain("We build agents.");
    expect(r.score).toBe(0.7421);
  });

  it("coalesces NULL tags to [] and does not fetch the embedding", () => {
    const r = rowToRetrieved({ ...base, tags: null });
    expect(r.chunk.meta.tags).toEqual([]);
    expect(r.chunk.embedding).toEqual([]);
  });

  it("coerces a numeric-as-string score to a number", () => {
    const r = rowToRetrieved({ ...base, score: "0.55" });
    expect(r.score).toBe(0.55);
    expect(typeof r.score).toBe("number");
  });
});
