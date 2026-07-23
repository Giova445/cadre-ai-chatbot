// Build-time ingest: content/*.md -> chunk by heading -> embed -> data/embeddings.json
// Runs offline (deterministic lexical embedder) with no key, or via real OpenAI
// embeddings when EMBEDDINGS_API_KEY is set. Idempotent; the artifact is read-only
// at runtime and must never be hand-edited.

import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { chunkMarkdown } from "../lib/chunk";
import {
  embedBatch,
  activeEmbeddingModel,
  computeIdf,
  lexicalEmbed,
} from "../lib/llm";
import {
  EMBED_DIMENSIONS,
  USING_REAL_EMBEDDINGS,
  LEXICAL_MODEL,
} from "../lib/config";
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

  const texts = pending.map((p) => p.text);

  // IDF over the chunk corpus (used by the lexical embedder so distinctive
  // terms dominate; ignored by the real-embeddings path).
  let model = activeEmbeddingModel();
  let idf: Record<string, number> = USING_REAL_EMBEDDINGS ? {} : computeIdf(texts);
  let vectors: number[][];

  try {
    vectors = await embedBatch(texts, idf);
  } catch (err) {
    // Resilience: a bad/incompatible embeddings key (e.g. an OpenRouter key,
    // which can't serve OpenAI embeddings) must NOT brick the whole build.
    // Fall back to the lexical embedder so the deploy still succeeds (degraded
    // retrieval). The runtime follows the artifact's model, so this stays
    // consistent (lexical query embedding for a lexical artifact).
    if (!USING_REAL_EMBEDDINGS) throw err;
    console.warn(
      `[embed] real embeddings failed (${(err as Error).message}); falling back to lexical so the build succeeds. Set a valid OpenAI-compatible EMBEDDINGS_API_KEY for real embeddings, or unset it to use lexical intentionally.`,
    );
    model = LEXICAL_MODEL;
    idf = computeIdf(texts);
    vectors = texts.map((t) => lexicalEmbed(t, idf));
  }

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

  const thresholdHint = model === LEXICAL_MODEL ? 0.2 : 0.35;
  const file: EmbeddingsFile = {
    model,
    dimensions: EMBED_DIMENSIONS,
    builtAt: new Date().toISOString(),
    thresholdHint,
    idf,
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
