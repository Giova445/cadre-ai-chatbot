// Zod boundary schema for the manual drain action
// (POST /api/admin/sitemap/drain). Kept in its OWN module (mirroring
// lib/admin/action-schemas.ts) so the untrusted-input boundary — UUID shape,
// batch-size clamp, and the max-iterations safety bound — stays unit-testable in
// a plain Node/vitest env without a Next request context. The route handler calls
// requireAdmin() (needs a request context) THEN runs this schema, so the schema
// is the only thing worth pinning here.
//
// `batch` and `maxIterations` are clamped to the same bounds the cron worker
// respects: a per-call cap of BATCH_MAX pages, and a server-side iteration limit
// so a runaway client can't pin a function open indefinitely. The route also
// re-clamps defensively, so a malformed body never escapes the bounds even if a
// caller bypasses this schema.

import { z } from "zod";
import { BATCH_MAX } from "./crawl-worker";

export const MAX_DRAIN_ITERATIONS = 20;

export const drainRequestSchema = z.object({
  jobId: z.string().uuid(),
  batch: z.number().int().min(1).max(BATCH_MAX).default(BATCH_MAX),
  maxIterations: z.number().int().min(1).max(MAX_DRAIN_ITERATIONS).default(MAX_DRAIN_ITERATIONS),
});

export type DrainRequest = z.infer<typeof drainRequestSchema>;

export type DrainResponse = {
  jobId: string;
  iterations: number;
  processed: number;
  remaining: number;
  done: boolean;
};

/**
 * Clamp a batch size into the worker's [1, BATCH_MAX] range. Used by the route
 * as defense-in-depth (the schema already enforces this, but the worker's
 * `drain(jobId, batch)` signature is public, so the boundary clamps too).
 */
export function clampBatch(value: number): number {
  if (!Number.isFinite(value) || value < 1) {
    // NaN / Infinity→BATCH_MAX (Infinity is a valid "large" value), anything
    // else invalid or below the worker's min floors to 1.
    return Number.isNaN(value) ? 1 : value === Infinity ? BATCH_MAX : 1;
  }
  return Math.min(Math.floor(value), BATCH_MAX);
}

/**
 * Decide whether the client should stop self-continuing. Pure so the UI loop and
 * any server-side guard share one decision: stop when `remaining === 0`, when the
 * iteration budget is exhausted, or when nothing was processed in a pass (the
 * queue is stuck or empty).
 */
export function shouldStop(opts: {
  remaining: number;
  iterations: number;
  maxIterations: number;
  processed: number;
}): boolean {
  if (opts.remaining <= 0) return true;
  if (opts.iterations >= opts.maxIterations) return true;
  if (opts.processed === 0) return true;
  return false;
}
