import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { flagRepo } from "@/lib/admin/flag-repo";
import { FLAG_STATUSES } from "@/lib/admin/contracts";
import type { FlagStatus } from "@/lib/admin/contracts";
import { ModeBadge } from "../../_components/ModeBadge";
import { StatusControl } from "../../_components/StatusControl";
import { CATEGORY_LABELS, StatusPill } from "../../_components/FlagBadge";
import { EmptyState } from "../../_components/EmptyState";
import { EmptyIcon } from "../../_components/Icons";
import styles from "../../admin.module.css";

const LIMIT = 20;

const STATUS_FILTERS: { value: FlagStatus | undefined; label: string }[] = [
  { value: undefined, label: "All" },
  { value: "open", label: "Open" },
  { value: "triaged", label: "Triaged" },
  { value: "resolved", label: "Resolved" },
  { value: "wontfix", label: "Won't fix" },
];

function isFlagStatus(value: string | undefined): value is FlagStatus {
  return value !== undefined && (FLAG_STATUSES as readonly string[]).includes(value);
}

function hrefFor(
  page: number,
  status: FlagStatus | undefined,
  client: string | undefined,
): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (status) params.set("status", status);
  if (client) params.set("client", client);
  const qs = params.toString();
  return qs ? `/admin/queue?${qs}` : "/admin/queue";
}

function truncate(text: string, max = 90): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; client?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const parsedPage = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const status = isFlagStatus(sp.status) ? sp.status : undefined;
  // Empty string collapses to undefined → the unscoped "All clients" read.
  const client = sp.client || undefined;

  const { rows, total } = await flagRepo.queue({ status, page, limit: LIMIT, clientId: client });
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <span className={styles.overline}>Review</span>
        <h1 className={styles.pageTitle}>Review queue</h1>
        <p className={styles.pageSub}>
          <span className={styles.countChip}>{total}</span>
          flagged {total === 1 ? "answer" : "answers"}
          {client ? ` · client: ${client}` : ""}
        </p>
      </div>

      <div className={styles.filterChips} role="group" aria-label="Filter by status">
        {STATUS_FILTERS.map((filter) => {
          const active = filter.value === status;
          return (
            <Link
              key={filter.label}
              href={hrefFor(1, filter.value, client)}
              className={`${styles.filterChip} ${active ? styles.filterChipActive : ""}`}
              aria-current={active ? "true" : undefined}
            >
              {filter.label}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          Icon={EmptyIcon.Flags}
          title={status ? `No ${status} flags in this view` : "No flags in this view"}
          body={
            status
              ? "Switch the status filter above to see flags in other states, or open a conversation and flag an answer to populate this queue."
              : "Flag an answer from a conversation detail view to populate the review queue. Flagged answers will surface here for triage."
          }
        />
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="sr-only">Flagged answers, review queue</caption>
              <thead>
                <tr>
                  <th scope="col">Query</th>
                  <th scope="col">Mode</th>
                  <th scope="col">Category</th>
                  <th scope="col">Note</th>
                  <th scope="col">Status</th>
                  <th scope="col">Created</th>
                  <th scope="col">
                    <span className="sr-only">Update status</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((flag) => (
                  <tr key={flag.id} className={styles.tableRow}>
                    <td className={styles.tableTextCell}>
                      <Link
                        href={
                          client
                            ? `/admin/conversations/${flag.conversationId}?client=${encodeURIComponent(client)}`
                            : `/admin/conversations/${flag.conversationId}`
                        }
                        className={styles.cellLink}
                      >
                        {truncate(flag.queryText)}
                      </Link>
                    </td>
                    <td>
                      <ModeBadge mode={flag.mode} />
                    </td>
                    <td>{CATEGORY_LABELS[flag.category]}</td>
                    <td className={styles.tableTextCell}>{flag.note || "—"}</td>
                    <td>
                      <StatusPill status={flag.status} />
                    </td>
                    <td>{DATE_FORMAT.format(new Date(flag.createdAt))}</td>
                    <td>
                      <StatusControl id={flag.id} status={flag.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className={styles.pagination} aria-label="Pagination">
            <Link
              href={hrefFor(Math.max(1, page - 1), status, client)}
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
              href={hrefFor(Math.min(totalPages, page + 1), status, client)}
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
