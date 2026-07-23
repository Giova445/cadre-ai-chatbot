// Build-time ingest: content/*.md -> chunk by heading -> embed -> data/embeddings.json
// Runs offline (deterministic lexical embedder) with no key, or via real OpenAI
// embeddings when EMBEDDINGS_API_KEY is set. Idempotent; the artifact is read-only
// at runtime and must never be hand-edited.

import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { chunkMarkdown } from "../lib/chunk";
import { embedBatch, activeEmbeddingModel } from "../lib/llm";
import { EMBED_DIMENSIONS, USING_REAL_EMBEDDINGS } from "../lib/config";
import type { Chunk, EmbeddingsFile } from "../lib/types";

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, "content");
const OUT_DIR = path.join(ROOT, "data");
const OUT_FILE = path.join(OUT_DIR, "embeddings.json");

async function readKbFiles(): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(CONTENT_DIR);
  } catch {
    throw new Error(
      `No content/ directory at ${CONTENT_DIR}. Author the KB (content/*.md) before embedding.`,
    );
  }
  const md = entries.filter((f) => f.endsWith(".md")).sort();
  if (md.length === 0) throw new Error("content/ has no .md files to embed.");
  return md;
}

async function main() {
  const files = await readKbFiles();

  // Build the raw chunk list first (text prefixed with "title | section").
  type Pending = { text: string; meta: Chunk["meta"] };
  const pending: Pending[] = [];

  for (const file of files) {
    const raw = await fs.readFile(path.join(CONTENT_DIR, file), "utf8");
    const { data, content } = matter(raw);
    const title = String(data.title ?? file.replace(/\.md$/, ""));
    const tags = Array.isArray(data.tags) ? data.tags.map(String) : [];
    const chunks = chunkMarkdown(content);
    for (const c of chunks) {
      const prefixed = `${title} | ${c.section}\n${c.text}`;
      pending.push({
        text: prefixed,
        meta: { source: file, title, section: c.section, tags },
      });
    }
  }

  console.log(
    `[embed] ${files.length} docs -> ${pending.length} chunks; embedder=${activeEmbeddingModel()} (real=${USING_REAL_EMBEDDINGS})`,
  );

  const vectors = await embedBatch(pending.map((p) => p.text));
  if (vectors.length !== pending.length) {
    throw new Error("embedding count mismatch");
  }

  const chunks: Chunk[] = pending.map((p, i) => {
    const embedding = vectors[i];
    if (embedding.length !== EMBED_DIMENSIONS) {
      throw new Error(
        `embedding dim ${embedding.length} != ${EMBED_DIMENSIONS} for chunk ${i}`,
      );
    }
    return {
      id: `${p.meta.source}#${i}`,
      text: p.text,
      embedding,
      meta: p.meta,
    };
  });

  const thresholdHint = USING_REAL_EMBEDDINGS ? 0.35 : 0.08;
  const file: EmbeddingsFile = {
    model: activeEmbeddingModel(),
    dimensions: EMBED_DIMENSIONS,
    builtAt: new Date().toISOString(),
    thresholdHint,
    chunks,
  };

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(file), "utf8");
  console.log(`[embed] wrote ${OUT_FILE} (${chunks.length} chunks, dim ${EMBED_DIMENSIONS})`);
}

main().catch((err) => {
  console.error("[embed] failed:", err);
  process.exit(1);
});
