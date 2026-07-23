import Link from "next/link";
import type { ClientUsageRow, Budget } from "@/lib/usage/types";
import { formatUsd } from "@/lib/admin/format-usd";
import { BudgetStatusBadge, type DisplayBudgetStatus } from "./BudgetStatusBadge";
import styles from "../admin.module.css";

const TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatTime(iso: string | null): string {
  return iso ? TIME_FORMAT.format(new Date(iso)) : "—";
}

// Presentation-only budget evaluation for the clients overview table. This is
// NOT the enforcement path (that is lib/usage/budget.ts checkBudget, read-only
// here) — it just maps a client's month-to-date spend against whichever
// budget applies (a client-specific ceiling, falling back to the global one)
// so the table can show an ok/warn/over badge without a per-client report call.
function statusFor(monthCostUsd: number, budget: Budget | undefined): DisplayBudgetStatus {
  if (!budget || budget.monthlyCeilingNanoUsd <= 0) return "none";
  const ceilingUsd = budget.monthlyCeilingNanoUsd / 1e9;
  const pct = ceilingUsd > 0 ? (monthCostUsd / ceilingUsd) * 100 : 0;
  if (pct >= 100) return "over";
  if (pct >= budget.warnPct) return "warn";
  return "ok";
}

function budgetFor(clientId: string, budgets: Budget[]): Budget | undefined {
  return (
    budgets.find((b) => b.scope === "client" && b.clientId === clientId) ??
    budgets.find((b) => b.scope === "global")
  );
}

function hrefFor(clientId: string): string {
  return `/admin/usage?client=${encodeURIComponent(clientId)}`;
}

// Client (tenant) usage overview. LLM $ (chat) and Embed $ (embedding) are
// rendered as SEPARATE columns — deliverable #6 in docs/product/usage-and-cost.md
// — never summed into a single "cost" figure that would hide the split.
export function UsageClientsTable({
  rows,
  budgets,
  activeClient,
}: {
  rows: ClientUsageRow[];
  budgets: Budget[];
  activeClient?: string;
}) {
  if (rows.length === 0) {
    return <p className={styles.emptyState}>No usage recorded yet.</p>;
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className="sr-only">Usage by client</caption>
        <thead>
          <tr>
            <th scope="col">Client</th>
            <th scope="col">Requests</th>
            <th scope="col">LLM $</th>
            <th scope="col">Embed $</th>
            <th scope="col">Month $</th>
            <th scope="col">Budget</th>
            <th scope="col">Last activity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const active = row.clientId === activeClient;
            return (
              <tr key={row.clientId} className={styles.tableRow}>
                <td>
                  <Link
                    href={hrefFor(row.clientId)}
                    className={styles.cellLink}
                    aria-current={active ? "true" : undefined}
                  >
                    {row.clientId}
                  </Link>
                </td>
                <td>{row.requests}</td>
                <td>{formatUsd(row.llmCostUsd)}</td>
                <td>{formatUsd(row.embedCostUsd)}</td>
                <td>{formatUsd(row.monthCostUsd)}</td>
                <td>
                  <BudgetStatusBadge status={statusFor(row.monthCostUsd, budgetFor(row.clientId, budgets))} />
                </td>
                <td>{formatTime(row.lastActivityAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
