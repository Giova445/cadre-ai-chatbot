import { formatUsd } from "@/lib/admin/format-usd";
import styles from "../admin.module.css";

// Cost split by model id (e.g. "gpt-4o-mini" vs "text-embedding-3-small") for
// the selected client, over the selected range. Sourced from
// UsageReport.byModel (lib/usage/report.ts getUsageReport).
export function UsageByModelTable({ rows }: { rows: Array<{ model: string; costUsd: number }> }) {
  if (rows.length === 0) {
    return <p className={styles.emptyState}>No per-model cost data for this range.</p>;
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className="sr-only">Cost by model</caption>
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col">$</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.model} className={styles.tableRow}>
              <td className={styles.tableTextCell}>{row.model}</td>
              <td>{formatUsd(row.costUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
