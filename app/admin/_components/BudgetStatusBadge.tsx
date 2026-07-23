import styles from "../admin.module.css";

export type DisplayBudgetStatus = "ok" | "warn" | "over" | "none";

const LABELS: Record<DisplayBudgetStatus, string> = {
  ok: "OK",
  warn: "Warn",
  over: "Over",
  none: "No budget",
};

const CLASS_BY_STATUS: Record<DisplayBudgetStatus, string> = {
  ok: styles.budgetOk,
  warn: styles.budgetWarn,
  over: styles.budgetOver,
  none: styles.budgetNone,
};

// Small colored pill for a budget's ok/warn/over state (BudgetStatus.status,
// lib/usage/types.ts). "none" is a display-only extension for rows with no
// ceiling configured yet — never sent to/from the usage backend.
export function BudgetStatusBadge({ status }: { status: DisplayBudgetStatus }) {
  return <span className={`${styles.badge} ${CLASS_BY_STATUS[status]}`}>{LABELS[status]}</span>;
}
