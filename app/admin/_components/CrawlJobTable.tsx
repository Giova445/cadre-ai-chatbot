import Link from "next/link";
import type { CrawlJob, CrawlJobStatus } from "@/lib/ingest/types";
import styles from "../admin.module.css";

const TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatTime(iso: string): string {
  return TIME_FORMAT.format(new Date(iso));
}

const JOB_STATUS_LABELS: Record<CrawlJobStatus, string> = {
  queued: "Queued",
  crawling: "Crawling",
  done: "Done",
  error: "Error",
};

// Reuses the same green/amber/blue/grey/red hues as ModeBadge/PageStatusBadge
// rather than a third palette: queued=grey, crawling=blue (in progress, like
// "escalate"), done=green, error=red.
const JOB_STATUS_CLASS: Record<CrawlJobStatus, string> = {
  queued: styles.badgeUnknown,
  crawling: styles.badgeEscalate,
  done: styles.badgeAnswer,
  error: styles.badgeFailed,
};

function jobHref(id: string, client: string | undefined): string {
  const params = new URLSearchParams();
  params.set("job", id);
  if (client) params.set("client", client);
  return `/admin/sitemap?${params.toString()}`;
}

export function CrawlJobTable({
  jobs,
  activeJobId,
  client,
}: {
  jobs: CrawlJob[];
  activeJobId?: string;
  client?: string;
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className="sr-only">Recent sitemap crawl jobs</caption>
        <thead>
          <tr>
            <th scope="col">Sitemap URL</th>
            <th scope="col">Status</th>
            <th scope="col">Discovered</th>
            <th scope="col">Embedded</th>
            <th scope="col">Skipped</th>
            <th scope="col">Failed</th>
            <th scope="col">Created</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr
              key={job.id}
              className={`${styles.tableRow} ${job.id === activeJobId ? styles.tableRowActive : ""}`}
            >
              <td>
                <Link href={jobHref(job.id, client)} className={styles.rowLink}>
                  {job.sitemapUrl}
                  <span className="sr-only"> — view per-URL status</span>
                </Link>
              </td>
              <td>
                <span className={`${styles.badge} ${JOB_STATUS_CLASS[job.status]}`}>
                  {JOB_STATUS_LABELS[job.status]}
                </span>
              </td>
              <td>{job.discovered}</td>
              <td>{job.embedded}</td>
              <td>{job.skipped}</td>
              <td>{job.failed}</td>
              <td className={styles.tableTextCell}>{formatTime(job.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
