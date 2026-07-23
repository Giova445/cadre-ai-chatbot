"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateFlagStatus } from "@/lib/admin/actions";
import { FLAG_STATUSES } from "@/lib/admin/contracts";
import type { FlagStatus } from "@/lib/admin/contracts";
import { STATUS_LABELS } from "./FlagBadge";
import styles from "../admin.module.css";

// Sets a flag's review status (queue row actions). Renders straight off the
// `status` prop rather than seeding local state from it: after a successful
// action we call router.refresh() to re-pull the server-rendered row, which
// avoids the classic "local state drifts from a prop that changes underneath
// it" bug you'd get from copying a prop into useState on mount.
export function StatusControl({ id, status }: { id: string; status: FlagStatus }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const router = useRouter();

  function setStatus(next: FlagStatus) {
    if (next === status || pending) return;
    setError(false);
    startTransition(async () => {
      try {
        await updateFlagStatus({ id, status: next });
        router.refresh();
      } catch {
        setError(true);
      }
    });
  }

  return (
    <div className={styles.statusControl} role="group" aria-label="Update flag status">
      {FLAG_STATUSES.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => setStatus(s)}
          disabled={pending || s === status}
          aria-pressed={s === status}
          className={`${styles.statusBtn} ${s === status ? styles.statusBtnActive : ""}`}
        >
          {STATUS_LABELS[s]}
        </button>
      ))}
      {error && (
        <span className={styles.statusError} role="alert">
          Failed — try again
        </span>
      )}
    </div>
  );
}
