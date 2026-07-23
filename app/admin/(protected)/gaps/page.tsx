import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { gapRepo } from "@/lib/admin/gap-repo";
import { ModeBadge } from "../../_components/ModeBadge";
import { ScoreBar } from "../../_components/ScoreBar";
import styles from "../../admin.module.css";

const LIMIT = 20;

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function truncate(text: string, max = 90): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function hrefFor(page: number): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/admin/gaps?${qs}` : "/admin/gaps";
}

export default async function GapsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const parsedPage = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const { rows, total } = await gapRepo.gaps({ page, limit: LIMIT });
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>KB gaps</h1>
        <p className={styles.pageSub}>
          {total} {total === 1 ? "candidate" : "candidates"} for KB improvement
        </p>
      </div>

      <p className={styles.pageNote}>
        Escalated / weak-retrieval / low-score / flagged turns — candidates for KB improvement.
      </p>

      {rows.length === 0 ? (
        <p className={styles.emptyState}>No gaps detected yet.</p>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="sr-only">KB gap candidates, ranked by recency</caption>
              <thead>
                <tr>
                  <th scope="col">Query</th>
                  <th scope="col">Mode</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Top score</th>
                  <th scope="col">Coverage</th>
                  <th scope="col">Flagged</th>
                  <th scope="col">Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((gap) => (
                  <tr key={gap.traceId} className={styles.tableRow}>
                    <td className={styles.tableTextCell}>
                      <Link href={`/admin/conversations/${gap.conversationId}`} className={styles.rowLink}>
                        {truncate(gap.queryText)}
                      </Link>
                    </td>
                    <td>
                      <ModeBadge mode={gap.mode} />
                    </td>
                    <td className={styles.tableTextCell}>{gap.reason}</td>
                    <td>
                      <ScoreBar score={gap.topScore} />
                    </td>
                    <td>{pct(gap.coverage)}</td>
                    <td>{gap.flagged ? <span className={styles.flaggedBadge}>Flagged</span> : "—"}</td>
                    <td>{DATE_FORMAT.format(new Date(gap.createdAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className={styles.pagination} aria-label="Pagination">
            <Link
              href={hrefFor(Math.max(1, page - 1))}
              className={`${styles.pageLink} ${page <= 1 ? styles.pageLinkDisabled : ""}`}
              aria-disabled={page <= 1}
              tabIndex={page <= 1 ? -1 : undefined}
            >
              ← Prev
            </Link>
            <span className={styles.pageStatus}>
              Page {page} of {totalPages}
            </span>
            <Link
              href={hrefFor(Math.min(totalPages, page + 1))}
              className={`${styles.pageLink} ${page >= totalPages ? styles.pageLinkDisabled : ""}`}
              aria-disabled={page >= totalPages}
              tabIndex={page >= totalPages ? -1 : undefined}
            >
              Next →
            </Link>
          </nav>
        </>
      )}
    </div>
  );
}
