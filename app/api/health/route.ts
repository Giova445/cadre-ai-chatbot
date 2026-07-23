// Health / readiness probe (G10). Shallow by design: reports liveness + the
// config posture (KB artifact loaded, embedder mode, chat-key presence) without
// making paid LLM calls. Wire an uptime monitor to it. Deep dependency probes
// (DB/Blob reachability) land with the persistence pillars.

import { getKB } from "@/lib/kb";
import { HAS_CHAT_KEY, USING_REAL_EMBEDDINGS, LEXICAL_MODEL, RETRIEVAL_BACKEND } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, unknown> = {};
  let ok = true;

  try {
    const kb = getKB();
    const loaded = Array.isArray(kb.chunks) && kb.chunks.length > 0;
    checks.kb = {
      loaded,
      chunks: kb.chunks?.length ?? 0,
      model: kb.model,
      dimensions: kb.dimensions,
    };
    if (!loaded) ok = false;

    // Report the embedder actually used for RETRIEVAL. pgvector always embeds
    // queries with the real model (the bundle artifact is unused there), so the
    // artifact-divergence check only applies to the bundle backend.
    const artifactLexical = kb.model === LEXICAL_MODEL;
    checks.embeddings =
      RETRIEVAL_BACKEND === "pgvector"
        ? { mode: "real", source: "pgvector-query", realKeyPresent: USING_REAL_EMBEDDINGS }
        : {
            mode: artifactLexical ? "lexical" : "real",
            artifactModel: kb.model,
            envRealFlag: USING_REAL_EMBEDDINGS,
            divergence: artifactLexical && USING_REAL_EMBEDDINGS,
          };
  } catch (e) {
    ok = false;
    checks.kb = { loaded: false, error: (e as Error).message };
    checks.embeddings = { mode: "unknown" };
  }

  checks.chat = { keyPresent: HAS_CHAT_KEY, mode: HAS_CHAT_KEY ? "llm" : "offline-stub" };

  // Retrieval backend posture. pgvector needs DATABASE_URL; a misconfig (backend
  // selected but no connection string) degrades so a monitor catches it — no
  // connection is opened here (that deep probe lands with the ingestion pillar).
  const dbConfigured = Boolean(process.env.DATABASE_URL);
  const pgvector = RETRIEVAL_BACKEND === "pgvector";
  // pgvector needs BOTH a connection string and a real embeddings key (queries
  // are embedded with the real model); either missing = every query would fail.
  const misconfig =
    pgvector && !dbConfigured
      ? "pgvector backend selected but DATABASE_URL is unset"
      : pgvector && !USING_REAL_EMBEDDINGS
        ? "pgvector backend requires real embeddings (EMBEDDINGS_API_KEY unset)"
        : null;
  checks.retrieval = {
    backend: RETRIEVAL_BACKEND,
    dbConfigured,
    ...(misconfig ? { error: misconfig } : {}),
  };
  if (misconfig) ok = false;

  return Response.json(
    { status: ok ? "ok" : "degraded", checks, ts: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
