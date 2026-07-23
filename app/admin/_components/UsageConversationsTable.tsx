import Link from "next/link";
import type { ConversationCostRow } from "@/lib/usage/types";
import { formatUsd } from "@/lib/admin/format-usd";
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

// Per-conversation cost drill-down for the selected client. Links back to the
// conversations transcript view (Phase 3 admin, app/admin/(protected)/
// conversations/[id]) so a reviewer can go from "this conversation cost $X" to
// "why" without leaving the panel.
export function UsageConversationsTable({ rows }: { rows: ConversationCostRow[] }) {
  if (rows.length === 0) {
    return <p className={styles.emptyState}>No conversation cost data for this client.</p>;
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className="sr-only">Cost by conversation</caption>
        <thead>
          <tr>
            <th scope="col">Conversation</th>
            <th scope="col">Turns</th>
            <th scope="col">Input tok</th>
            <th scope="col">Output tok</th>
            <th scope="col">Embed tok</th>
            <th scope="col">$</th>
            <th scope="col">Last activity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.conversationId} className={styles.tableRow}>
              <td>
                <Link
                  href={`/admin/conversations/${row.conversationId}?client=${encodeURIComponent(row.clientId)}`}
                  className={styles.cellLink}
                >
                  {row.conversationId.slice(0, 8)}…
                </Link>
              </td>
              <td>{row.turns}</td>
              <td>{row.inputTokens.toLocaleString()}</td>
              <td>{row.outputTokens.toLocaleString()}</td>
              <td>{row.embedTokens.toLocaleString()}</td>
              <td>{formatUsd(row.costUsd)}</td>
              <td>{formatTime(row.lastTs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
