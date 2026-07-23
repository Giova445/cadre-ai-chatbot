// FROZEN SEAMS for the admin dashboard (Phases 1-3). Every admin module builds
// against these signatures so parallel work never collides. Changing anything
// here is a coordinated change, not a local one (same discipline as lib/types.ts).
//
// Stack decision: Supabase + the `postgres` lib (lib/db.ts getDb()), NOT
// Neon/Drizzle/Auth.js (the plan's originals) — the DB is already live on
// Supabase. Auth is a signed-cookie ADMIN_PASSWORD gate, verified server-side.

import type { Decision, DecisionMode } from "@/lib/guardrail";
import type { Retrieved } from "@/lib/types";

export type { DecisionMode };

// A chunk is "cited" when its score clears this floor (mirrors guardrail.ts
// CITATION_FLOOR) — lets the trace panel show retrieved-but-not-cited chunks.
export const CITATION_FLOOR = 0.05;

// ---------------------------------------------------------------------------
// Phase 1 — turn logging (lib/trace.ts). Called from the chat route via
// after()/waitUntil so it never blocks the stream; best-effort (never throws).
// ---------------------------------------------------------------------------
export type LogTurnInput = {
  sessionId: string; // from the httpOnly `cadre_sid` cookie (set by the route)
  clientId?: string; // tenant; defaults to "default"
  userMessage: string;
  assistantMessage: string; // accumulated as the stream is piped
  query: string;
  decision: Decision; // lib/guardrail.ts — unchanged
  results: Retrieved[]; // lib/kb.ts retrieveText() — the FULL trace
  embedderModel: string; // getKB().model (or "text-embedding-3-small" for pgvector)
  backend: string; // RETRIEVAL_BACKEND ("bundle" | "pgvector")
  threshold: number; // EFFECTIVE_THRESHOLD at decision time
};

// ---------------------------------------------------------------------------
// Phase 3 — read models + repositories (lib/admin/repos.ts). Read-only.
// ---------------------------------------------------------------------------
export type Page<T> = { rows: T[]; total: number; page: number; limit: number };

export type ConversationSummary = {
  id: string;
  sessionId: string;
  startedAt: string; // ISO
  lastAt: string; // ISO
  lastMode: string | null;
  messageCount: number;
  firstQuestion: string; // first user message (for the list row)
};

export type MessageRow = {
  id: string;
  turnIndex: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type TraceChunkRow = {
  chunkId: string;
  source: string;
  section: string;
  title: string;
  tags: string[];
  score: number;
  rank: number;
  cited: boolean;
};

export type TraceRow = {
  id: string;
  messageId: string;
  queryText: string;
  mode: string;
  reason: string;
  topScore: number;
  coverage: number;
  threshold: number;
  embedderModel: string;
  backend: string;
  createdAt: string;
  chunks: TraceChunkRow[]; // ranked, includes retrieved-but-not-cited
};

export type ConversationDetail = {
  conversation: ConversationSummary;
  messages: MessageRow[];
  traces: Record<string, TraceRow>; // keyed by the assistant message id
};

export interface ConversationRepo {
  list(f: {
    page: number;
    limit: number;
    mode?: DecisionMode;
    clientId?: string;
  }): Promise<Page<ConversationSummary>>;
  getDetail(id: string): Promise<ConversationDetail | null>;
}

// ---------------------------------------------------------------------------
// Phase 2 — admin auth (lib/admin/auth.ts). Signed-cookie gate, server-verified
// in EVERY admin route/RSC (defense-in-depth; middleware is UX only).
// ---------------------------------------------------------------------------
export type AdminSession = { authenticated: true; issuedAt: number };
export const ADMIN_COOKIE = "cadre_admin";
export const SID_COOKIE = "cadre_sid";
