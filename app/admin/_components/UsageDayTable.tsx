import type { DayUsageRow } from "@/lib/usage/types";
import { formatUsd } from "@/lib/admin/format-usd";
import styles from "../admin.module.css";

// Per-day breakdown for the selected client: token mix (input/output/embed),
// request count, and cost. A lightweight bar (cost relative to the busiest
// day in range) gives an at-a-glance trend without pulling in a charting lib.
export function UsageDayTable({ rows }: { rows: DayUsageRow[] }) {
  if (rows.length === 0) {
    return <p className={styles.emptyState}>No usage in this range.</p>;
  }

  const maxCost = Math.max(...rows.map((r) => r.costUsd), 0.000001);

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className="sr-only">Usage by day</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Input tok</th>
            <th scope="col">Output tok</th>
            <th scope="col">Embed tok</th>
            <th scope="col">Requests</th>
            <th scope="col">$</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const pct = Math.round((row.costUsd / maxCost) * 100);
            return (
              <tr key={row.date} className={styles.tableRow}>
                <td>{row.date}</td>
                <td>{row.inputTokens.toLocaleString()}</td>
                <td>{row.outputTokens.toLocaleString()}</td>
                <td>{row.embedTokens.toLocaleString()}</td>
                <td>{row.requests}</td>
                <td>
                  <div className={styles.dayCostCell}>
                    <div
                      className={styles.dayCostBar}
                      role="img"
                      aria-label={`${formatUsd(row.costUsd)} of ${formatUsd(maxCost)} peak day`}
                    >
                      <div className={styles.dayCostBarFill} style={{ width: `${pct}%` }} />
                    </div>
                    <span>{formatUsd(row.costUsd)}</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
