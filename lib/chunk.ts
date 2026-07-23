// Markdown chunker for the build-time ingest. Splits by heading (the natural
// semantic boundary of a support KB), keeps chunks ~300–500 tokens with ~15%
// overlap, and never splits fenced code blocks or tables.

export type RawChunk = { section: string; text: string };

const MAX_TOKENS = 450;
const MIN_TOKENS = 40;
const OVERLAP_RATIO = 0.15;

// Rough token estimate: words * 1.3 (good enough for chunk sizing).
function estTokens(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 1.3);
}

function isHeading(line: string): boolean {
  return /^#{1,6}\s+/.test(line);
}

function headingText(line: string): string {
  return line.replace(/^#{1,6}\s+/, "").trim();
}

type Section = { heading: string; body: string };

// Split markdown into sections keyed by heading. Content before the first
// heading is attached to an "Overview" section.
function splitSections(markdown: string): Section[] {
  const lines = markdown.split(/\r?\n/);
  const sections: Section[] = [];
  let current: Section = { heading: "Overview", body: "" };
  let inFence = false;

  for (const line of lines) {
    if (/^```/.test(line.trim())) inFence = !inFence;
    if (!inFence && isHeading(line)) {
      if (current.body.trim()) sections.push(current);
      current = { heading: headingText(line), body: "" };
    } else {
      current.body += line + "\n";
    }
  }
  if (current.body.trim()) sections.push(current);
  return sections;
}

// Split a body into atomic blocks separated by blank lines, but keep fenced
// code blocks whole even when they contain blank lines.
function splitIntoBlocks(body: string): string[] {
  const lines = body.split(/\r?\n/);
  const blocks: string[] = [];
  let buf: string[] = [];
  let inFence = false;
  const flush = () => {
    const text = buf.join("\n").trim();
    if (text) blocks.push(text);
    buf = [];
  };
  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      if (!inFence) {
        flush(); // start a fresh fenced block
        inFence = true;
        buf.push(line);
      } else {
        buf.push(line);
        inFence = false;
        flush(); // close the fenced block as one atomic unit
      }
      continue;
    }
    if (!inFence && line.trim() === "") flush();
    else buf.push(line);
  }
  flush();
  return blocks;
}

// Split a block of paragraphs into token-bounded pieces with overlap. Never
// breaks inside a fenced code block or a markdown table.
function splitBody(body: string): string[] {
  if (estTokens(body) <= MAX_TOKENS) return [body.trim()];

  const blocks = splitIntoBlocks(body);

  const pieces: string[] = [];
  let buf: string[] = [];
  let bufTokens = 0;

  const flush = () => {
    if (buf.length) {
      pieces.push(buf.join("\n\n"));
      // Carry ~15% overlap: keep the trailing blocks that sum to OVERLAP.
      const overlapBudget = Math.floor(bufTokens * OVERLAP_RATIO);
      const carry: string[] = [];
      let carryTokens = 0;
      for (let i = buf.length - 1; i >= 0 && carryTokens < overlapBudget; i--) {
        carry.unshift(buf[i]);
        carryTokens += estTokens(buf[i]);
      }
      buf = carry;
      bufTokens = carryTokens;
    }
  };

  for (const block of blocks) {
    const t = estTokens(block);
    if (bufTokens + t > MAX_TOKENS && bufTokens >= MIN_TOKENS) flush();
    buf.push(block);
    bufTokens += t;
  }
  if (buf.length) pieces.push(buf.join("\n\n"));
  return pieces;
}

export function chunkMarkdown(markdown: string): RawChunk[] {
  const out: RawChunk[] = [];
  for (const section of splitSections(markdown)) {
    for (const piece of splitBody(section.body)) {
      if (piece.trim()) out.push({ section: section.heading, text: piece.trim() });
    }
  }
  return out;
}
