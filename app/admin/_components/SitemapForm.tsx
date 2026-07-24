"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import styles from "../admin.module.css";

type SubmitResult = { jobId: string; discovered: number };

function isSubmitResult(value: unknown): value is SubmitResult {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).jobId === "string" &&
    typeof (value as Record<string, unknown>).discovered === "number"
  );
}

function errorMessage(body: unknown, status: number): string {
  if (typeof body === "object" && body !== null && typeof (body as Record<string, unknown>).error === "string") {
    return (body as Record<string, unknown>).error as string;
  }
  return `Request failed (${status}).`;
}

// Paste-a-sitemap-URL submit form. POSTs directly to the crawl-discovery REST
// endpoint (not a Server Action) — discovery is a genuinely async job the
// backend tracks in crawl_jobs/sitemap_pages, not a mutation this page's own
// data model owns; the 202 response is the seam. On success it links straight
// to the per-URL status table (?job=<id>) so the operator can start watching
// it progress immediately.
export function SitemapForm({ client }: { client?: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);

  function handleSubmit(formData: FormData) {
    const raw = formData.get("sitemapUrl");
    const sitemapUrl = typeof raw === "string" ? raw.trim() : "";
    if (!sitemapUrl) {
      setError("Enter a sitemap URL.");
      setResult(null);
      return;
    }

    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/sitemap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(client ? { sitemapUrl, client } : { sitemapUrl }),
        });
        const body: unknown = await res.json().catch(() => null);
        if (res.status !== 202 || !isSubmitResult(body)) {
          setError(errorMessage(body, res.status));
          return;
        }
        setResult(body);
      } catch {
        setError("Could not reach the server. Try again.");
      }
    });
  }

  const jobHref = result
    ? `/admin/sitemap?job=${encodeURIComponent(result.jobId)}${
        client ? `&client=${encodeURIComponent(client)}` : ""
      }`
    : null;

  return (
    <form action={handleSubmit} className={styles.sitemapForm} aria-label="Submit a sitemap URL to crawl">
      <label className={styles.flagFormField}>
        <span className={styles.flagFormLabel}>Sitemap URL</span>
        <input
          name="sitemapUrl"
          type="url"
          inputMode="url"
          placeholder="https://example.com/sitemap.xml"
          className={styles.starterInput}
          disabled={pending}
          required
        />
      </label>
      <div className={styles.flagFormActions}>
        <button type="submit" className={styles.flagSubmitBtn} disabled={pending}>
          {pending ? "Submitting…" : "Crawl sitemap"}
        </button>
      </div>
      {error && (
        <p className={styles.flagFormError} role="alert">
          {error}
        </p>
      )}
      {result && jobHref && (
        <p className={styles.sitemapFormSuccess} role="status">
          {result.discovered} {result.discovered === 1 ? "page" : "pages"} queued.{" "}
          <Link href={jobHref} className={styles.cellLink}>
            View status
          </Link>
        </p>
      )}
    </form>
  );
}
