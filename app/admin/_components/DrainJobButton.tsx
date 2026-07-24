"use client";

import { useState, useTransition } from "react";
import styles from "../admin.module.css";
import { PlayIcon } from "./Icons";

type DrainResponse = {
  jobId: string;
  iterations: number;
  processed: number;
  remaining: number;
  done: boolean;
};

function isDrainResponse(v: unknown): v is DrainResponse {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Record<string, unknown>).jobId === "string" &&
    typeof (v as Record<string, unknown>).iterations === "number" &&
    typeof (v as Record<string, unknown>).processed === "number" &&
    typeof (v as Record<string, unknown>).remaining === "number" &&
    typeof (v as Record<string, unknown>).done === "boolean"
  );
}

const MAX_CLIENT_ITERATIONS = 25;
const INTER_CALL_DELAY_MS = 250;

// Manual "Process now" affordance for a crawl job (docs/product/admin-embed-and-
// sitemap.md § B). The cron worker route is secret-gated and never runs locally
// (CRAWL_WORKER_SECRET unset), so an operator had no way to drain a stuck job
// short of waiting for prod cron. This button calls the admin-SESSION-gated
// /api/admin/sitemap/drain endpoint — which reuses the SAME drain() as cron — in
// a client-side loop until the job is done or the per-call + client iteration
// budgets are spent, surfacing { processed, remaining } so the operator sees
// progress. Self-continues while remaining > 0; stops on error.
export function DrainJobButton({ jobId }: { jobId: string }) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runDrain() {
    setError(null);
    setStatus("Processing…");
    let totalProcessed = 0;
    let clientIterations = 0;
    let done = false;
    let lastRemaining = -1;
    while (!done && clientIterations < MAX_CLIENT_ITERATIONS) {
      try {
        const res = await fetch("/api/admin/sitemap/drain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId }),
        });
        const body: unknown = await res.json().catch(() => null);
        if (res.status === 404) {
          setError("Crawl job not found.");
          setStatus(null);
          return;
        }
        if (res.status !== 200 || !isDrainResponse(body)) {
          setError(
            typeof body === "object" && body && typeof (body as Record<string, unknown>).error === "string"
              ? (body as Record<string, unknown>).error as string
              : `Request failed (${res.status}).`,
          );
          setStatus(null);
          return;
        }
        totalProcessed += body.processed;
        lastRemaining = body.remaining;
        done = body.done;
        if (!done && body.processed === 0) break;
        setStatus(`Processed ${totalProcessed} — ${body.remaining} remaining…`);
        if (!done) await new Promise((r) => setTimeout(r, INTER_CALL_DELAY_MS));
      } catch {
        setError("Could not reach the server. Try again.");
        setStatus(null);
        return;
      }
      clientIterations++;
    }
    if (error) return;
    if (done) {
      setStatus(`Done — processed ${totalProcessed} pages.`);
    } else if (lastRemaining >= 0) {
      setStatus(`Paused — ${lastRemaining} remaining. Click again to continue.`);
    }
  }

  return (
    <div className={styles.sitemapDrainRow}>
      <button
        type="button"
        className={styles.sitemapDrainBtn}
        disabled={pending}
        onClick={() => startTransition(runDrain)}
        aria-label="Process this crawl job now"
      >
        <PlayIcon size={13} />
        <span>Process now</span>
      </button>
      {pending && <span className={styles.pageNote}>Working…</span>}
      {!pending && status && <span className={styles.pageNote} role="status">{status}</span>}
      {!pending && error && (
        <span className={styles.flagFormError} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
