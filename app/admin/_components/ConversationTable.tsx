import Link from "next/link";
import type { ConversationSummary } from "@/lib/admin/contracts";
import { ModeBadge } from "./ModeBadge";
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

function truncate(text: string, max = 90): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

// Semantic table of logged conversations. Each row is a real link — the
// anchor's ::after is stretched over the whole <tr> (position:relative) so
// the entire row is clickable while staying a single, accessible link per
// row rather than nested/duplicate links.
export function ConversationTable({ rows }: { rows: ConversationSummary[] }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className="sr-only">Logged conversations</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">First question</th>
            <th scope="col">Turns</th>
            <th scope="col">Last mode</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={styles.tableRow}>
              <td>
                <Link href={`/admin/conversations/${row.id}`} className={styles.rowLink}>
                  {formatTime(row.lastAt)}
                  <span className="sr-only"> — open conversation, first asked: {row.firstQuestion}</span>
                </Link>
              </td>
              <td className={styles.tableTextCell}>{truncate(row.firstQuestion)}</td>
              <td>{row.messageCount}</td>
              <td>
                <ModeBadge mode={row.lastMode} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
