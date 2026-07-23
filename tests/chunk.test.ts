// The build-time markdown chunker. Verifies it splits on headings (the semantic
// boundary of the KB) and never tears a fenced code block across chunks.

import { describe, it, expect } from "vitest";
import { chunkMarkdown } from "@/lib/chunk";

describe("chunkMarkdown", () => {
  it("splits a doc with two '##' headings into chunks named for each section", () => {
    const md = [
      "## Services",
      "We provide applied-AI consulting and hands-on implementation support.",
      "",
      "## Portal",
      "The client portal is where engagement artifacts and updates live.",
    ].join("\n");

    const chunks = chunkMarkdown(md);

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const sections = chunks.map((c) => c.section);
    expect(sections).toContain("Services");
    expect(sections).toContain("Portal");

    // Each chunk's body should carry the content of its own section.
    const services = chunks.find((c) => c.section === "Services");
    const portal = chunks.find((c) => c.section === "Portal");
    expect(services?.text).toContain("consulting");
    expect(portal?.text).toContain("client portal");
  });

  it("keeps a fenced code block intact when a section is large enough to split", () => {
    // A single fenced code block with no internal blank lines is one atomic block.
    const codeBlock = [
      "```ts",
      "export function sentinel(): number {",
      "  const SENTINEL = 424242;",
      "  return SENTINEL;",
      "}",
      "```",
    ].join("\n");

    // Surround it with enough prose to push the section well past the ~450-token
    // ceiling so the chunker is forced to emit multiple pieces.
    const filler = Array.from(
      { length: 12 },
      (_, i) =>
        `Paragraph ${i} explains how Cadre approaches applied artificial intelligence work ` +
        "with measurable outcomes, extreme ownership, and a scrappy team-first delivery model " +
        "that keeps every engagement grounded in real client goals and steady iterative progress.",
    );

    const md = [
      "## Guide",
      filler.slice(0, 6).join("\n\n"),
      codeBlock,
      filler.slice(6).join("\n\n"),
    ].join("\n\n");

    const chunks = chunkMarkdown(md);

    // The section was large enough that it actually got split.
    expect(chunks.length).toBeGreaterThanOrEqual(2);

    // Exactly one chunk contains the code fence, and it holds the block whole.
    const withCode = chunks.filter((c) => c.text.includes("```"));
    expect(withCode).toHaveLength(1);
    expect(withCode[0].text).toContain(codeBlock);
    // Balanced fences (opening + closing) live together in that one chunk.
    const fenceCount = (withCode[0].text.match(/```/g) ?? []).length;
    expect(fenceCount).toBe(2);
  });
});
