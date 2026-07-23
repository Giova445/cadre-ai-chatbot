import { describe, it, expect } from "vitest";
import type { Chunk, Retrieved } from "@/lib/types";
import { deriveChunkRows } from "@/lib/trace";

function retrieved(source: string, score: number): Retrieved {
  const chunk: Chunk = {
    id: `${source}#0`,
    text: `text for ${source}`,
    embedding: [1, 0, 0],
    meta: {
      source,
      title: `${source} title`,
      section: "Overview",
      tags: [source.replace(".md", ""), "kb"],
    },
  };
  return { chunk, score };
}

describe("deriveChunkRows", () => {
  it("assigns rank by array index, preserving input order", () => {
    const results = [
      retrieved("services.md", 0.9),
      retrieved("pricing.md", 0.5),
      retrieved("about.md", 0.1),
    ];
    const rows = deriveChunkRows(results);
    expect(rows.map((r) => r.rank)).toEqual([0, 1, 2]);
    expect(rows.map((r) => r.chunkId)).toEqual([
      "services.md#0",
      "pricing.md#0",
      "about.md#0",
    ]);
  });

  it("marks a chunk exactly at the 0.05 floor as cited", () => {
    const [row] = deriveChunkRows([retrieved("services.md", 0.05)]);
    expect(row.cited).toBe(true);
  });

  it("marks a chunk just below the floor (0.049) as not cited", () => {
    const [row] = deriveChunkRows([retrieved("services.md", 0.049)]);
    expect(row.cited).toBe(false);
  });

  it("maps every field from the Retrieved fixture", () => {
    const [row] = deriveChunkRows([retrieved("faq.md", 0.42)]);
    expect(row).toEqual({
      chunkId: "faq.md#0",
      source: "faq.md",
      section: "Overview",
      title: "faq.md title",
      tags: ["faq", "kb"],
      score: 0.42,
      rank: 0,
      cited: true,
    });
  });

  it("returns an empty array for no results", () => {
    expect(deriveChunkRows([])).toEqual([]);
  });
});
