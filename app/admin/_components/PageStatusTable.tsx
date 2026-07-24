import type { SitemapPage } from "@/lib/ingest/types";
import { PageStatusBadge } from "./PageStatusBadge";
import styles from "../admin.module.css";

const TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const SKIP_REASON_LABELS: Record<string, string> = {
  robots: "robots.txt",
  noindex: "noindex",
  unchanged: "unchanged",
  empty: "empty",
  no_text: "no text",
  non_html: "non-HTML",
};

function formatTime(iso: string | null): string {
  return iso ? TIME_FORMAT.format(new Date(iso)) : "—";
}

// The core per-URL status deliverable (§ B admin-embed-and-sitemap.md § 4
// Phase 4): one real table row per crawled/queued page — never collapsed into
// a single job-level "done" blob. skip_reason and error surface WHY a page
// didn't embed (robots disallow, noindex, empty body, a fetch error) so an
// operator can act — fix robots.txt, wait for a re-crawl, escalate a
// persistent failure — without digging into server logs.
export function PageStatusTable({ pages }: { pages: SitemapPage[] }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className="sr-only">Per-URL crawl status</caption>
        <thead>
          <tr>
            <th scope="col">URL</th>
            <th scope="col">Status</th>
            <th scope="col">Skip reason</th>
            <th scope="col">Chunks</th>
            <th scope="col">Last crawled</th>
            <th scope="col">Error</th>
          </tr>
        </thead>
        <tbody>
          {pages.map((page) => (
            <tr key={page.id} className={styles.tableRow}>
              <td className={styles.tableTextCell}>
                <a
                  href={page.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.cellLink}
                >
                  {page.url}
                </a>
              </td>
              <td>
                <PageStatusBadge status={page.status} />
              </td>
              <td className={styles.tableTextCell}>
                {page.skipReason ? (SKIP_REASON_LABELS[page.skipReason] ?? page.skipReason) : "—"}
              </td>
              <td>{page.chunks}</td>
              <td className={styles.tableTextCell}>{formatTime(page.lastCrawled)}</td>
              <td className={styles.tableTextCell}>{page.error ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
