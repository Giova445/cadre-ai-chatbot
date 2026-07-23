"use client";

import { useState } from "react";
import { MAX_STARTER_LEN } from "@/lib/starters";
import type { StarterRow } from "@/lib/admin/contracts";
import styles from "../admin.module.css";

// One row of the starter-questions editor: the chip label (inline-editable),
// an enable/disable toggle, up/down reorder arrows, and delete. All mutations
// are lifted to the parent (StarterEditor) so a single in-flight transition
// disables the whole list; this component owns only its local "editing" draft.
// Rendered off the `starter` prop (never seeded into persistent state) so a
// server refresh after a mutation is the source of truth — the same discipline
// as StatusControl.
export function StarterRowItem({
  starter,
  index,
  count,
  disabled,
  onSave,
  onToggle,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  starter: StarterRow;
  index: number;
  count: number;
  disabled: boolean;
  onSave: (text: string) => void;
  onToggle: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(starter.text);

  function beginEdit() {
    setDraft(starter.text);
    setEditing(true);
  }

  function commit() {
    const next = draft.trim();
    // No-op on empty or unchanged — the server would reject empty (min(1)) and a
    // no-diff save is pointless. Just close the editor.
    if (!next || next === starter.text) {
      setEditing(false);
      return;
    }
    onSave(next);
    setEditing(false);
  }

  return (
    <li className={`${styles.starterItem} ${starter.enabled ? "" : styles.starterItemOff}`}>
      <div className={styles.starterOrder} aria-hidden="true">
        <button
          type="button"
          className={styles.orderBtn}
          onClick={onMoveUp}
          disabled={disabled || index === 0}
          aria-label={`Move "${starter.text}" up`}
        >
          ↑
        </button>
        <button
          type="button"
          className={styles.orderBtn}
          onClick={onMoveDown}
          disabled={disabled || index === count - 1}
          aria-label={`Move "${starter.text}" down`}
        >
          ↓
        </button>
      </div>

      {editing ? (
        <input
          className={styles.starterInput}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          maxLength={MAX_STARTER_LEN}
          disabled={disabled}
          aria-label="Starter text"
          autoFocus
        />
      ) : (
        <span className={styles.starterText}>{starter.text}</span>
      )}

      <div className={styles.starterRowActions}>
        {editing ? (
          <>
            <button
              type="button"
              className={styles.starterSaveBtn}
              onClick={commit}
              disabled={disabled}
            >
              Save
            </button>
            <button
              type="button"
              className={styles.starterGhostBtn}
              onClick={() => setEditing(false)}
              disabled={disabled}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={styles.starterGhostBtn}
              onClick={beginEdit}
              disabled={disabled}
            >
              Edit
            </button>
            <button
              type="button"
              className={styles.starterGhostBtn}
              onClick={onToggle}
              disabled={disabled}
              aria-pressed={starter.enabled}
            >
              {starter.enabled ? "Disable" : "Enable"}
            </button>
            <button
              type="button"
              className={styles.starterDeleteBtn}
              onClick={onDelete}
              disabled={disabled}
            >
              Delete
            </button>
          </>
        )}
      </div>
    </li>
  );
}
