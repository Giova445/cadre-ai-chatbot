"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { setBudgetAction } from "@/lib/usage/budget-actions";
import type { Budget } from "@/lib/usage/types";
import styles from "../admin.module.css";

function findBudget(
  scope: "global" | "client",
  clientId: string,
  budgets: Budget[],
): Budget | undefined {
  return scope === "global"
    ? budgets.find((b) => b.scope === "global")
    : budgets.find((b) => b.scope === "client" && b.clientId === clientId);
}

// Per-client + global monthly budget ceiling editor. A small controlled form
// (not a native <form action>, since scope/clientId drive which existing
// Budget prefills the numeric fields) that posts to the "use server"
// setBudgetAction — requireAdmin + Zod-validated at the boundary, then
// usageRepo.setBudget. router.refresh() re-pulls the authoritative budgets
// list after a save so the clients-table status badges reflect the change.
export function BudgetEditor({
  budgets,
  defaultClientId,
}: {
  budgets: Budget[];
  defaultClientId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [scope, setScope] = useState<"global" | "client">(defaultClientId ? "client" : "global");
  const [clientId, setClientId] = useState(defaultClientId ?? "");

  const current = useMemo(() => findBudget(scope, clientId, budgets), [scope, clientId, budgets]);
  const [monthlyCeilingUsd, setMonthlyCeilingUsd] = useState(() =>
    current ? current.monthlyCeilingNanoUsd / 1e9 : 0,
  );
  const [warnPct, setWarnPct] = useState(() => current?.warnPct ?? 80);
  const [softBlock, setSoftBlock] = useState(() => current?.softBlock ?? false);

  // Re-sync the numeric fields whenever scope/clientId changes to a budget
  // that already exists, so editing an existing ceiling doesn't start blank.
  function applyScope(nextScope: "global" | "client") {
    setScope(nextScope);
    const match = findBudget(nextScope, clientId, budgets);
    setMonthlyCeilingUsd(match ? match.monthlyCeilingNanoUsd / 1e9 : 0);
    setWarnPct(match?.warnPct ?? 80);
    setSoftBlock(match?.softBlock ?? false);
  }

  function applyClientId(nextClientId: string) {
    setClientId(nextClientId);
    const match = findBudget("client", nextClientId, budgets);
    setMonthlyCeilingUsd(match ? match.monthlyCeilingNanoUsd / 1e9 : 0);
    setWarnPct(match?.warnPct ?? 80);
    setSoftBlock(match?.softBlock ?? false);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await setBudgetAction({
          scope,
          clientId: scope === "client" ? clientId.trim() : "",
          monthlyCeilingUsd,
          warnPct,
          softBlock,
        });
        setSaved(true);
        router.refresh();
      } catch {
        setError("Could not save this budget. Check the fields and try again.");
      }
    });
  }

  const invalid = scope === "client" && clientId.trim().length === 0;

  return (
    <form className={styles.budgetEditorForm} onSubmit={handleSubmit} aria-label="Budget editor">
      <div className={styles.budgetEditorRow}>
        <label className={styles.flagFormField}>
          <span className={styles.flagFormLabel}>Scope</span>
          <select
            className={styles.flagSelect}
            value={scope}
            onChange={(e) => applyScope(e.target.value === "client" ? "client" : "global")}
            disabled={pending}
          >
            <option value="global">Global</option>
            <option value="client">Client</option>
          </select>
        </label>

        {scope === "client" && (
          <label className={styles.flagFormField}>
            <span className={styles.flagFormLabel}>Client ID</span>
            <input
              className={styles.flagInput}
              type="text"
              value={clientId}
              onChange={(e) => applyClientId(e.target.value)}
              placeholder="e.g. acme"
              maxLength={64}
              disabled={pending}
              required
            />
          </label>
        )}

        <label className={styles.flagFormField}>
          <span className={styles.flagFormLabel}>Monthly ceiling (USD, 0 = unlimited)</span>
          <input
            className={styles.flagInput}
            type="number"
            min={0}
            step="0.01"
            value={monthlyCeilingUsd}
            onChange={(e) => setMonthlyCeilingUsd(Number(e.target.value))}
            disabled={pending}
          />
        </label>

        <label className={styles.flagFormField}>
          <span className={styles.flagFormLabel}>Warn at (%)</span>
          <input
            className={styles.flagInput}
            type="number"
            min={0}
            max={100}
            step="1"
            value={warnPct}
            onChange={(e) => setWarnPct(Number(e.target.value))}
            disabled={pending}
          />
        </label>

        <label className={styles.budgetToggle}>
          <input
            type="checkbox"
            checked={softBlock}
            onChange={(e) => setSoftBlock(e.target.checked)}
            disabled={pending}
          />
          <span>Soft-block over ceiling</span>
        </label>
      </div>

      <div className={styles.flagFormActions}>
        <button type="submit" className={styles.flagSubmitBtn} disabled={pending || invalid}>
          {pending ? "Saving…" : "Save budget"}
        </button>
        {saved && !pending && <span className={styles.starterHint}>Saved.</span>}
      </div>

      {error && (
        <p className={styles.flagFormError} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
