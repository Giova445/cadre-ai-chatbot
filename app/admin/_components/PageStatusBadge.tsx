import type { PageStatus } from "@/lib/ingest/types";
import styles from "../admin.module.css";

const LABELS: Record<PageStatus, string> = {
  queued: "Queued",
  embedded: "Embedded",
  skipped: "Skipped",
  failed: "Failed",
};

// embedded=green, skipped=amber, failed=red, queued=grey (per spec) — reuses
// the existing status-hue tokens (ModeBadge's green/amber, plus one new
// `.badgeFailed` red variant) rather than inventing a second palette.
const CLASS_BY_STATUS: Record<PageStatus, string> = {
  queued: styles.badgeUnknown,
  embedded: styles.badgeAnswer,
  skipped: styles.badgeRefuse,
  failed: styles.badgeFailed,
};

export function PageStatusBadge({ status }: { status: PageStatus }) {
  const label = LABELS[status] ?? status;
  const cls = CLASS_BY_STATUS[status] ?? styles.badgeUnknown;
  return <span className={`${styles.badge} ${cls}`}>{label}</span>;
}
