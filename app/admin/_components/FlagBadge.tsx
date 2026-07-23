import type { FlagCategory, FlagRow, FlagStatus } from "@/lib/admin/contracts";
import styles from "../admin.module.css";

export const CATEGORY_LABELS: Record<FlagCategory, string> = {
  hallucination: "Hallucination",
  wrong_source: "Wrong source",
  missed_escalation: "Missed escalation",
  tone: "Tone",
  incomplete: "Incomplete",
  other: "Other",
};

export const STATUS_LABELS: Record<FlagStatus, string> = {
  open: "Open",
  triaged: "Triaged",
  resolved: "Resolved",
  wontfix: "Won't fix",
};

const STATUS_CLASS: Record<FlagStatus, string> = {
  open: styles.statusOpen,
  triaged: styles.statusTriaged,
  resolved: styles.statusResolved,
  wontfix: styles.statusWontfix,
};

// Small colored pill for a flag's review status alone (open=amber,
// triaged=blue, resolved=green, wontfix=grey) — reused standalone in the
// queue table's Status column, and composed into FlagBadge below.
export function StatusPill({ status }: { status: FlagStatus }) {
  return (
    <span className={`${styles.statusPill} ${STATUS_CLASS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

// Compact pill combining a flag's category (plain text) and current status
// (colored StatusPill), rendered per flag under an assistant transcript turn.
export function FlagBadge({ flag }: { flag: FlagRow }) {
  return (
    <span className={styles.flagBadge}>
      <span className={styles.flagBadgeCategory}>{CATEGORY_LABELS[flag.category]}</span>
      <StatusPill status={flag.status} />
    </span>
  );
}
