import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { conversationRepo } from "@/lib/admin/repos";
import type { DecisionMode } from "@/lib/admin/contracts";
import { ConversationTable } from "../../_components/ConversationTable";
import { EmptyState } from "../../_components/EmptyState";
import { EmptyIcon } from "../../_components/Icons";
import styles from "../../admin.module.css";

const LIMIT = 20;

const MODE_FILTERS: { value: DecisionMode | undefined; label: string }[] = [
  { value: undefined, label: "All" },
  { value: "answer", label: "Answer" },
  { value: "refuse", label: "Refuse" },
  { value: "escalate", label: "Escalate" },
];

function isDecisionMode(value: string | undefined): value is DecisionMode {
  return value === "answer" || value === "refuse" || value === "escalate";
}

function hrefFor(
  page: number,
  mode: DecisionMode | undefined,
  client: string | undefined,
  session: string | undefined,
): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (mode) params.set("mode", mode);
  if (client) params.set("client", client);
  if (session) params.set("session", session);
  const qs = params.toString();
  return qs ? `/admin/conversations?${qs}` : "/admin/conversations";
}

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; mode?: string; client?: string; session?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const parsedPage = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const mode = isDecisionMode(sp.mode) ? sp.mode : undefined;
  // Empty strings collapse to undefined → the unscoped "All clients" / all-sessions read.
  const client = sp.client || undefined;
  const session = sp.session || undefined;

  const { rows, total } = await conversationRepo.list({
    page,
    limit: LIMIT,
    mode,
    clientId: client,
    sessionId: session,
  });
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  // Show the Client column only in the unscoped "All clients" view AND only once
  // a real (non-"default") tenant appears — so single-tenant deploys (where the
  // header selector also self-hides) never see a redundant all-"default" column.
  const showClient = !client && rows.some((row) => row.clientId !== "default");

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <span className={styles.overline}>Conversations</span>
        <h1 className={styles.pageTitle}>Conversations</h1>
        <p className={styles.pageSub}>
          <span className={styles.countChip}>{total}</span>
          {total === 1 ? "conversation logged" : "conversations logged"}
          {client ? ` · client: ${client}` : ""}
        </p>
      </div>

      {session && (
        <p className={styles.pageNote}>
          Filtered to session <code>{session}</code>.{" "}
          <Link href={hrefFor(1, mode, client, undefined)} className={styles.cellLink}>
            Clear session filter
          </Link>
        </p>
      )}

      <div className={styles.filterChips} role="group" aria-label="Filter by decision mode">
        {MODE_FILTERS.map((filter) => {
          const active = filter.value === mode;
          return (
            <Link
              key={filter.label}
              href={hrefFor(1, filter.value, client, session)}
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
          Icon={EmptyIcon.Conversations}
          title="No conversations logged yet"
          body="Conversations appear here as the public chatbot finishes its first turns. Try the public site or your own scenario chips to seed traffic."
        />
      ) : (
        <>
          <ConversationTable rows={rows} showClient={showClient} activeClient={client} />
          <nav className={styles.pagination} aria-label="Pagination">
            <Link
              href={hrefFor(Math.max(1, page - 1), mode, client, session)}
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
              href={hrefFor(Math.min(totalPages, page + 1), mode, client, session)}
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
