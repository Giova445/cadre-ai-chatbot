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

    // Report the ACTUAL retrieval mode (derived from the artifact the runtime
    // follows), not the env flag. Flag a build-vs-env divergence: a lexical
    // artifact with EMBEDDINGS_API_KEY set means the key is unused for retrieval.
    const artifactLexical = kb.model === LEXICAL_MODEL;
    checks.embeddings = {
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
  const backendMisconfigured = RETRIEVAL_BACKEND === "pgvector" && !dbConfigured;
  checks.retrieval = {
    backend: RETRIEVAL_BACKEND,
    dbConfigured,
    ...(backendMisconfigured ? { error: "pgvector backend selected but DATABASE_URL is unset" } : {}),
  };
  if (backendMisconfigured) ok = false;

  return Response.json(
    { status: ok ? "ok" : "degraded", checks, ts: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
