import styles from "../admin.module.css";

const LABELS: Record<string, string> = {
  answer: "Answered",
  refuse: "Refused",
  escalate: "Escalated",
};

const CLASS_BY_MODE: Record<string, string> = {
  answer: styles.badgeAnswer,
  refuse: styles.badgeRefuse,
  escalate: styles.badgeEscalate,
};

// Small colored pill for a decision mode. Falls back to a neutral pill for
// unknown/null modes (e.g. a conversation with no assistant turns yet).
export function ModeBadge({ mode }: { mode: string | null }) {
  if (!mode) {
    return <span className={`${styles.badge} ${styles.badgeUnknown}`}>—</span>;
  }
  const label = LABELS[mode] ?? mode;
  const cls = CLASS_BY_MODE[mode] ?? styles.badgeUnknown;
  return <span className={`${styles.badge} ${cls}`}>{label}</span>;
}
