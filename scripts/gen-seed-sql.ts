// Emit per-source SQL files (INSERT documents + kb_chunks + ingest_jobs) for
// seeding Supabase via the MCP server (mcp__supabase__execute_sql) when the DB
// connection string / password is NOT available locally — the MCP is already
// authenticated to the project. Connects to NO database; only calls the
// embeddings API (real embeddings required).
//
//   node --env-file=.env.local --import tsx scripts/gen-seed-sql.ts <outDir>
//
// The reproducible, connection-based path is scripts/ingest.ts (pnpm ingest);
// this generator is the credential-free alternative that pairs with the MCP.

import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { chunkMarkdown } from "../lib/chunk";
import { embedBatch, activeEmbeddingModel } from "../lib/llm";
import { EMBED_DIMENSIONS, USING_REAL_EMBEDDINGS } from "../lib/config";

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, "content");
const OUT_DIR = process.argv[2] || path.join(ROOT, "seed-out");
const CLIENT = process.env.INGEST_CLIENT_ID ?? "default";

const q = (s: string) => "'" + s.replace(/'/g, "''") + "'"; // SQL text literal
const tagsLit = (t: string[]) => "'{" + t.map((x) => x.replace(/[{},"]/g, "")).join(",") + "}'";
const vecLit = (v: number[]) => "'[" + v.map((n) => n.toFixed(6)).join(",") + "]'::vector";

async function main() {
  if (!USING_REAL_EMBEDDINGS) {
    throw new Error("Set EMBEDDINGS_API_KEY (real embeddings) — refusing to seed pgvector with lexical vectors.");
  }
  await fs.mkdir(OUT_DIR, { recursive: true });
  const files = (await fs.readdir(CONTENT_DIR)).filter((f) => f.endsWith(".md")).sort();

  const manifest: string[] = [];
  let idx = 0;
  for (const file of files) {
    const raw = await fs.readFile(path.join(CONTENT_DIR, file), "utf8");
    const { data, content } = matter(raw);
    const title = String(data.title ?? file.replace(/\.md$/, ""));
    const tags = Array.isArray(data.tags) ? data.tags.map(String) : [];
    const chunks = chunkMarkdown(content).map((c) => ({
      section: c.section,
      text: `${title} | ${c.section}\n${c.text}`,
    }));
    const vectors = await embedBatch(chunks.map((c) => c.text));
    for (const v of vectors) {
      if (v.length !== EMBED_DIMENSIONS) throw new Error(`dim ${v.length} != ${EMBED_DIMENSIONS} (${file})`);
    }

    const stmts: string[] = [];
    stmts.push(
      `insert into documents (client_id, source, title, tags) values (${q(CLIENT)}, ${q(file)}, ${q(title)}, ${tagsLit(tags)})\n` +
        `  on conflict (client_id, source) do update set title=excluded.title, tags=excluded.tags, current_version=documents.current_version+1, updated_at=now();`,
    );
    stmts.push(`delete from kb_chunks where client_id=${q(CLIENT)} and source=${q(file)};`);
    const values = chunks
      .map(
        (c, i) =>
          `(${q(CLIENT)}, ${q(`${file}#${i}`)}, (select id from documents where client_id=${q(CLIENT)} and source=${q(file)}), ` +
          `${q(file)}, ${q(title)}, ${q(c.section)}, ${tagsLit(tags)}, ${q(c.text)}, ${vecLit(vectors[i])}, 1)`,
      )
      .join(",\n");
    stmts.push(
      `insert into kb_chunks (client_id, chunk_key, document_id, source, title, section, tags, text, embedding, version) values\n${values};`,
    );
    stmts.push(`insert into ingest_jobs (client_id, source, status, chunks) values (${q(CLIENT)}, ${q(file)}, 'ready', ${chunks.length});`);

    const outName = `seed_${String(idx).padStart(2, "0")}_${file.replace(/\.md$/, "")}.sql`;
    await fs.writeFile(path.join(OUT_DIR, outName), stmts.join("\n\n") + "\n", "utf8");
    manifest.push(`${outName}\t${chunks.length} chunks`);
    idx++;
  }
  console.log(`[gen-seed] embedder=${activeEmbeddingModel()} client=${CLIENT} -> ${OUT_DIR}`);
  console.log(manifest.join("\n"));
}

main().catch((e) => {
  console.error("[gen-seed] failed:", e);
  process.exit(1);
});
