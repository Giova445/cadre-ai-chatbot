// Shared ingestion core. Turns ONE source (a content file, an uploaded doc, or a
// crawled sitemap page) into embedded kb_chunks: chunk → embed → atomic
// delete-then-insert into documents + kb_chunks. Lifted verbatim from
// scripts/ingest.ts so every ingestion front-end shares ONE chunk/embed/upsert
// path — a crawled page is byte-shape-identical to a file at retrieval time.
//
// Idempotent per source (wholesale replace by client_id+source), so re-ingesting
// the same source is safe and re-embeds only that source's chunks.

import { getDb } from "@/lib/db";
import { chunkMarkdown } from "@/lib/chunk";
import { embedBatchWithUsage } from "@/lib/llm";
import { recordUsage } from "@/lib/usage/record";
import { EMBED_DIMENSIONS, EMBED_MODEL } from "@/lib/config";

export type IngestSource = {
  clientId: string;
  source: string; // filename OR page URL — the dedup/replace key
  title: string;
  tags?: string[];
  text: string; // raw markdown-ish text; chunked internally
  operation?: "ingest" | "query"; // usage attribution; defaults "ingest"
};

export type IngestResult = {
  source: string;
  chunks: number;
  tokens: number;
  model: string;
};

function vectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

/**
 * Chunk → embed → atomically replace one source's rows in documents + kb_chunks.
 * Reuses chunkMarkdown + the real embedder (embedBatchWithUsage); the CALLER
 * guarantees real embeddings for a pgvector store. Embedding spend is metered
 * (best-effort) exactly like file ingest. Returns the chunk/token counts.
 */
export async function ingestSource(input: IngestSource): Promise<IngestResult> {
  const { clientId, source, title, text } = input;
  const tags = input.tags ?? [];

  // Same "title | section" prefix scripts/ingest.ts uses, so retrieval sees an
  // identical chunk shape whatever the front-end.
  const chunks = chunkMarkdown(text).map((c) => ({
    section: c.section,
    text: `${title} | ${c.section}\n${c.text}`,
  }));
  if (chunks.length === 0) {
    return { source, chunks: 0, tokens: 0, model: EMBED_MODEL };
  }

  const { vectors, tokens } = await embedBatchWithUsage(chunks.map((c) => c.text));
  for (const v of vectors) {
    if (v.length !== EMBED_DIMENSIONS) {
      throw new Error(`embedding dim ${v.length} != ${EMBED_DIMENSIONS} for ${source}`);
    }
  }

  // Meter embedding spend like file/content ingest (best-effort; never blocks).
  if (tokens > 0) {
    await recordUsage({
      clientId,
      conversationId: null,
      kind: "embedding",
      operation: input.operation ?? "ingest",
      provider: "openai",
      model: EMBED_MODEL,
      inputTokens: tokens,
    }).catch(() => {});
  }

  const sql = getDb();
  await sql.begin(async (tx) => {
    const [doc] = await tx`
      insert into documents (client_id, source, title, tags, updated_at)
      values (${clientId}, ${source}, ${title}, ${tags}, now())
      on conflict (client_id, source)
      do update set title = excluded.title, tags = excluded.tags,
                    current_version = documents.current_version + 1, updated_at = now()
      returning id, current_version
    `;
    // Replace this source's chunks wholesale (idempotent re-ingest).
    await tx`delete from kb_chunks where client_id = ${clientId} and source = ${source}`;
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      await tx`
        insert into kb_chunks
          (client_id, chunk_key, document_id, source, title, section, tags, text, embedding, version)
        values
          (${clientId}, ${`${source}#${i}`}, ${doc.id}, ${source}, ${title},
           ${c.section}, ${tags}, ${c.text}, ${vectorLiteral(vectors[i])}::vector, ${doc.current_version})
      `;
    }
    await tx`
      insert into ingest_jobs (client_id, source, status, chunks, updated_at)
      values (${clientId}, ${source}, 'ready', ${chunks.length}, now())
    `;
  });

  return { source, chunks: chunks.length, tokens, model: EMBED_MODEL };
}
