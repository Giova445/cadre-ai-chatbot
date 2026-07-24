// Seed content/*.md into Supabase Postgres (pgvector) via the SHARED ingest core
// (lib/ingest/core.ts) — the same chunk→embed→upsert path the sitemap crawler and
// (future) file uploads use. Each file is one "source".
//
// Requires:  DATABASE_URL (Supabase)  +  real embeddings (EMBEDDINGS_API_KEY,
//            plus EMBEDDINGS_BASE_URL for OpenRouter). Idempotent per source.
//            Run:  pnpm ingest   (apply db/schema.sql first).

import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { activeEmbeddingModel } from "../lib/llm";
import { USING_REAL_EMBEDDINGS } from "../lib/config";
import { ingestSource } from "../lib/ingest/core";
import { closeDb } from "../lib/db";

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, "content");
const CLIENT_ID = process.env.INGEST_CLIENT_ID ?? "default";

async function readKbFiles(): Promise<string[]> {
  const entries = await fs.readdir(CONTENT_DIR).catch(() => {
    throw new Error(`No content/ directory at ${CONTENT_DIR}.`);
  });
  const md = entries.filter((f) => f.endsWith(".md")).sort();
  if (md.length === 0) throw new Error("content/ has no .md files to ingest.");
  return md;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Provision Supabase and set the connection string before ingesting.",
    );
  }
  if (!USING_REAL_EMBEDDINGS) {
    throw new Error(
      "pgvector ingest requires REAL embeddings. Set EMBEDDINGS_API_KEY (+ EMBEDDINGS_BASE_URL for OpenRouter) and retry.",
    );
  }

  const files = await readKbFiles();
  console.log(
    `[ingest] ${files.length} docs; embedder=${activeEmbeddingModel()}; client=${CLIENT_ID}`,
  );

  let total = 0;
  try {
    for (const file of files) {
      const raw = await fs.readFile(path.join(CONTENT_DIR, file), "utf8");
      const { data, content } = matter(raw);
      const title = String(data.title ?? file.replace(/\.md$/, ""));
      const tags = Array.isArray(data.tags) ? data.tags.map(String) : [];
      const res = await ingestSource({ clientId: CLIENT_ID, source: file, title, tags, text: content });
      total += res.chunks;
      console.log(`[ingest] ${file}: ${res.chunks} chunks`);
    }
    console.log(`[ingest] done — ${total} chunks across ${files.length} docs.`);
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error("[ingest] failed:", err);
  process.exit(1);
});
