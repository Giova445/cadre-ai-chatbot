// Tests for lib/ingest/drain-request.ts — the untrusted-input boundary for the
// manual crawl-drain action (POST /api/admin/sitemap/drain). The route handler
// calls requireAdmin() (needs a Next request context, can't run in plain
// vitest), so the schema + the pure iteration/stop predicates are the testable
// seam. Mirrors the discipline of tests/actions.test.ts and
// tests/starter-actions.test.ts: pin the boundary here, not the action.
//
// What we assert:
//   - drainRequestSchema accepts a UUID + optional batch/maxIterations, defaults
//     to BATCH_MAX / MAX_DRAIN_ITERATIONS.
//   - rejects non-UUID jobId, out-of-range batch (> BATCH_MAX), and out-of-range
//     maxIterations (> MAX_DRAIN_ITERATIONS).
//   - clampBatch keeps drain()'s public batch in [1, BATCH_MAX].
//   - shouldStop is the pure "stop self-continuing" predicate the UI loop and the
//     server-side loop share: stops on done, budget exhaustion, or no progress.

import { describe, it, expect } from "vitest";
import {
  drainRequestSchema,
  clampBatch,
  shouldStop,
  MAX_DRAIN_ITERATIONS,
} from "@/lib/ingest/drain-request";
import { BATCH_MAX } from "@/lib/ingest/crawl-worker";

const VALID_UUID = "57d1f518-486b-4b59-b3f6-63a4f9fa7dfd";

describe("drainRequestSchema", () => {
  it("accepts a bare jobId and defaults batch + maxIterations", () => {
    const r = drainRequestSchema.safeParse({ jobId: VALID_UUID });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.jobId).toBe(VALID_UUID);
      expect(r.data.batch).toBe(BATCH_MAX);
      expect(r.data.maxIterations).toBe(MAX_DRAIN_ITERATIONS);
    }
  });

  it("accepts an explicit in-range batch", () => {
    const r = drainRequestSchema.safeParse({ jobId: VALID_UUID, batch: 4 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.batch).toBe(4);
  });

  it("rejects a non-UUID jobId", () => {
    expect(drainRequestSchema.safeParse({ jobId: "not-a-uuid" }).success).toBe(false);
    expect(drainRequestSchema.safeParse({ jobId: "57d1f518" }).success).toBe(false);
  });

  it("rejects batch greater than BATCH_MAX", () => {
    expect(
      drainRequestSchema.safeParse({ jobId: VALID_UUID, batch: BATCH_MAX + 1 }).success,
    ).toBe(false);
  });

  it("rejects a zero or negative batch", () => {
    expect(drainRequestSchema.safeParse({ jobId: VALID_UUID, batch: 0 }).success).toBe(false);
    expect(drainRequestSchema.safeParse({ jobId: VALID_UUID, batch: -1 }).success).toBe(false);
  });

  it("rejects maxIterations above the server-side ceiling", () => {
    expect(
      drainRequestSchema.safeParse({ jobId: VALID_UUID, maxIterations: MAX_DRAIN_ITERATIONS + 1 })
        .success,
    ).toBe(false);
  });

  it("rejects non-number batch", () => {
    expect(drainRequestSchema.safeParse({ jobId: VALID_UUID, batch: "8" }).success).toBe(false);
  });
});

describe("clampBatch", () => {
  it("clamps down to BATCH_MAX", () => {
    expect(clampBatch(BATCH_MAX + 50)).toBe(BATCH_MAX);
  });

  it("floors at 1 for invalid/zero/negative input (drain()'s min)", () => {
    expect(clampBatch(0)).toBe(1);
    expect(clampBatch(-3)).toBe(1);
    expect(clampBatch(NaN)).toBe(1);
    expect(clampBatch(Infinity)).toBe(BATCH_MAX);
  });

  it("passes a valid in-range value through (floored)", () => {
    expect(clampBatch(5)).toBe(5);
    expect(clampBatch(5.9)).toBe(5);
  });
});

describe("shouldStop", () => {
  it("stops when remaining is zero (job done)", () => {
    expect(shouldStop({ remaining: 0, iterations: 1, maxIterations: 20, processed: 8 })).toBe(true);
  });

  it("stops when the iteration budget is exhausted", () => {
    expect(shouldStop({ remaining: 40, iterations: 20, maxIterations: 20, processed: 8 })).toBe(true);
  });

  it("stops when nothing was processed in a pass (stuck/empty queue)", () => {
    expect(shouldStop({ remaining: 5, iterations: 3, maxIterations: 20, processed: 0 })).toBe(true);
  });

  it("continues while remaining > 0, under budget, and making progress", () => {
    expect(shouldStop({ remaining: 12, iterations: 1, maxIterations: 20, processed: 8 })).toBe(false);
  });
});
