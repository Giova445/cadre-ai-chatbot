// Seed content/*.md into Supabase Postgres (pgvector) for RETRIEVAL_BACKEND=pgvector.
//
// Requires:  DATABASE_URL (Supabase)  +  real embeddings (EMBEDDINGS_API_KEY,
//            plus EMBEDDINGS_BASE_URL for OpenRouter). pgvector is real-only by
//            design — the runtime embeds queries with the same model.
// Idempotent per source: re-ingesting a source replaces its chunks in one
// transaction (no partial state). Run:  pnpm ingest
//
// Apply db/schema.sql FIRST (creates the vector extension + tables).

import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import postgres from "postgres";
import { chunkMarkdown } from "../lib/chunk";
import { embedBatchWithUsage, activeEmbeddingModel } from "../lib/llm";
import { EMBED_DIMENSIONS, EMBED_MODEL, USING_REAL_EMBEDDINGS } from "../lib/config";
import { recordUsage } from "../lib/usage/record";
import type { Chunk } from "../lib/types";

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, "content");
const CLIENT_ID = process.env.INGEST_CLIENT_ID ?? "default";

type Pending = { text: string; meta: Chunk["meta"] };

function vectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

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

  // Group chunks per source so each document is replaced atomically.
  const bySource = new Map<string, { title: string; tags: string[]; chunks: Pending[] }>();
  for (const file of files) {
    const raw = await fs.readFile(path.join(CONTENT_DIR, file), "utf8");
    const { data, content } = matter(raw);
    const title = String(data.title ?? file.replace(/\.md$/, ""));
    const tags = Array.isArray(data.tags) ? data.tags.map(String) : [];
    const group = { title, tags, chunks: [] as Pending[] };
    for (const c of chunkMarkdown(content)) {
      group.chunks.push({
        text: `${title} | ${c.section}\n${c.text}`,
        meta: { source: file, title, section: c.section, tags },
      });
    }
    bySource.set(file, group);
  }

  const total = [...bySource.values()].reduce((n, g) => n + g.chunks.length, 0);
  console.log(
    `[ingest] ${files.length} docs -> ${total} chunks; embedder=${activeEmbeddingModel()}; client=${CLIENT_ID}`,
  );

  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
  try {
    for (const [source, group] of bySource) {
      const texts = group.chunks.map((c) => c.text);
      // real embeddings (idf unused); capture token usage to meter build-time cost.
      const { vectors, tokens } = await embedBatchWithUsage(texts);
      // Best-effort: attribute build-time embedding spend to the ingest client.
      // A metering failure must never fail the ingest.
      if (tokens > 0) {
        await recordUsage({
          clientId: CLIENT_ID,
          conversationId: null,
          kind: "embedding",
          operation: "ingest",
          provider: "openai",
          model: EMBED_MODEL,
          inputTokens: tokens,
        }).catch((err) => {
          console.error(`[ingest] usage record failed for ${source}:`, err);
        });
      }
      for (const v of vectors) {
        if (v.length !== EMBED_DIMENSIONS) {
          throw new Error(`embedding dim ${v.length} != ${EMBED_DIMENSIONS} for ${source}`);
        }
      }

      await sql.begin(async (tx) => {
        const [doc] = await tx`
          insert into documents (client_id, source, title, tags, updated_at)
          values (${CLIENT_ID}, ${source}, ${group.title}, ${group.tags}, now())
          on conflict (client_id, source)
          do update set title = excluded.title, tags = excluded.tags,
                        current_version = documents.current_version + 1, updated_at = now()
          returning id, current_version
        `;
        // Replace this source's chunks wholesale (idempotent re-ingest).
        await tx`delete from kb_chunks where client_id = ${CLIENT_ID} and source = ${source}`;
        for (let i = 0; i < group.chunks.length; i++) {
          const c = group.chunks[i];
          await tx`
            insert into kb_chunks
              (client_id, chunk_key, document_id, source, title, section, tags, text, embedding, version)
            values
              (${CLIENT_ID}, ${`${source}#${i}`}, ${doc.id}, ${source}, ${c.meta.title},
               ${c.meta.section}, ${c.meta.tags}, ${c.text},
               ${vectorLiteral(vectors[i])}::vector, ${doc.current_version})
          `;
        }
        await tx`
          insert into ingest_jobs (client_id, source, status, chunks, updated_at)
          values (${CLIENT_ID}, ${source}, 'ready', ${group.chunks.length}, now())
        `;
      });
      console.log(`[ingest] ${source}: ${group.chunks.length} chunks`);
    }
    console.log(`[ingest] done — ${total} chunks across ${files.length} docs.`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("[ingest] failed:", err);
  process.exit(1);
});
