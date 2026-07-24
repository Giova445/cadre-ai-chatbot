"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createStarter,
  updateStarter,
  reorderStarters,
  deleteStarter,
} from "@/lib/admin/starter-actions";
import {
  sanitizeStarters,
  MAX_STARTERS,
  MAX_STARTER_LEN,
} from "@/lib/starters";
import type { StarterRow } from "@/lib/admin/contracts";
import { StarterRowItem } from "./StarterRowItem";
import { EmptyState } from "./EmptyState";
import { EmptyIcon } from "./Icons";
import styles from "../admin.module.css";

// The maker starter-questions editor (Rollout § C, § 4.4). Renders off the
// server-fetched `starters` prop; every mutation goes through a "use server"
// action (requireAdmin → Zod → starterRepo → revalidatePath) and then
// router.refresh() re-pulls the authoritative rows — so local state never drifts
// from the DB (the StatusControl discipline). A single useTransition disables the
// whole surface while a write is in flight. The live preview mirrors exactly what
// a visitor sees: enabled rows, in order, through the shared sanitizeStarters().
export function StarterEditor({
  clientId,
  starters,
}: {
  clientId: string;
  starters: StarterRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newText, setNewText] = useState("");
  const router = useRouter();

  const orderedIds = starters.map((s) => s.id);

  // Preview = what the widget/hosted page will render for this tenant. An empty
  // enabled set means visitors fall back to the built-in defaults (endpoint +
  // resolveStarters), so we say so rather than showing a blank strip.
  const preview = sanitizeStarters(
    starters.filter((s) => s.enabled).map((s) => s.text),
  );
  const atCap = starters.length >= MAX_STARTERS;

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch {
        setError("Could not save. Try again.");
      }
    });
  }

  function addStarter() {
    const text = newText.trim();
    if (!text || pending) return;
    run(async () => {
      await createStarter({ clientId, text });
      setNewText("");
    });
  }

  function saveText(id: string, text: string) {
    run(() => updateStarter({ id, text }));
  }

  function toggleEnabled(id: string, enabled: boolean) {
    run(() => updateStarter({ id, enabled: !enabled }));
  }

  function removeStarter(id: string) {
    run(() => deleteStarter({ id }));
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= orderedIds.length) return;
    const next = [...orderedIds];
    [next[index], next[target]] = [next[target], next[index]];
    run(() => reorderStarters({ clientId, orderedIds: next }));
  }

  return (
    <div className={styles.starterEditor}>
      <form
        className={styles.starterAddForm}
        onSubmit={(e) => {
          e.preventDefault();
          addStarter();
        }}
      >
        <label className={styles.flagFormField}>
          <span className={styles.flagFormLabel}>New starter question</span>
          <input
            className={styles.starterInput}
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="e.g. How do I book a strategy call?"
            maxLength={MAX_STARTER_LEN}
            disabled={pending || atCap}
          />
        </label>
        <button
          type="submit"
          className={styles.starterSaveBtn}
          disabled={pending || atCap || newText.trim().length === 0}
        >
          {pending ? "Saving…" : "Add"}
        </button>
      </form>

      {atCap && (
        <p className={styles.starterHint}>
          At the {MAX_STARTERS}-chip cap — disable or delete one to add another.
          (Extra rows are allowed but only the first {MAX_STARTERS} enabled ones show.)
        </p>
      )}

      {error && (
        <p className={styles.flagFormError} role="alert">
          {error}
        </p>
      )}

      {starters.length === 0 ? (
        <EmptyState
          Icon={EmptyIcon.Questions}
          size="panel"
          title="No starter questions for this client"
          body="Visitors see the built-in defaults. Add a chip below to override the default prompt set for this client."
        />
      ) : (
        <ol className={styles.starterList}>
          {starters.map((starter, index) => (
            <StarterRowItem
              key={starter.id}
              starter={starter}
              index={index}
              count={starters.length}
              disabled={pending}
              onSave={(text) => saveText(starter.id, text)}
              onToggle={() => toggleEnabled(starter.id, starter.enabled)}
              onDelete={() => removeStarter(starter.id)}
              onMoveUp={() => move(index, -1)}
              onMoveDown={() => move(index, 1)}
            />
          ))}
        </ol>
      )}

      <section className={styles.previewPanel} aria-label="Live preview">
        <h2 className={styles.previewTitle}>Preview</h2>
        {preview.length === 0 ? (
          <p className={styles.previewEmpty}>
            No enabled starters — visitors fall back to the built-in defaults.
          </p>
        ) : (
          <div className={styles.previewChips}>
            {preview.map((label) => (
              <span key={label} className={styles.previewChip}>
                {label}
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
