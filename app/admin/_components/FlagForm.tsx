"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createFlag } from "@/lib/admin/actions";
import { FLAG_CATEGORIES } from "@/lib/admin/contracts";
import type { FlagCategory } from "@/lib/admin/contracts";
import { CATEGORY_LABELS } from "./FlagBadge";
import styles from "../admin.module.css";

const CATEGORY_SET = new Set<string>(FLAG_CATEGORIES);

function isFlagCategory(value: FormDataEntryValue | null): value is FlagCategory {
  return typeof value === "string" && CATEGORY_SET.has(value);
}

// Compact, collapsible "flag this answer" form rendered under each assistant
// transcript turn. Closed by default (just a trigger button) so a normal
// read of the transcript isn't cluttered with form chrome.
export function FlagForm({ messageId }: { messageId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  if (!open) {
    return (
      <button type="button" className={styles.flagTrigger} onClick={() => setOpen(true)}>
        Flag this answer
      </button>
    );
  }

  function handleSubmit(formData: FormData) {
    const category = isFlagCategory(formData.get("category")) ? (formData.get("category") as FlagCategory) : "other";
    const rawNote = formData.get("note");
    const note = typeof rawNote === "string" ? rawNote.trim() : "";

    setError(null);
    startTransition(async () => {
      try {
        await createFlag({ messageId, category, note });
        router.refresh();
        formRef.current?.reset();
        setOpen(false);
      } catch {
        setError("Could not save this flag. Try again.");
      }
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} className={styles.flagForm} aria-label="Flag this answer">
      <label className={styles.flagFormField}>
        <span className={styles.flagFormLabel}>Category</span>
        <select
          name="category"
          className={styles.flagSelect}
          defaultValue={FLAG_CATEGORIES[0]}
          disabled={pending}
          required
        >
          {FLAG_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.flagFormField}>
        <span className={styles.flagFormLabel}>Note (optional)</span>
        <input
          name="note"
          type="text"
          className={styles.flagInput}
          placeholder="What went wrong?"
          maxLength={280}
          disabled={pending}
        />
      </label>
      <div className={styles.flagFormActions}>
        <button type="submit" className={styles.flagSubmitBtn} disabled={pending}>
          {pending ? "Saving…" : "Save flag"}
        </button>
        <button
          type="button"
          className={styles.flagCancelBtn}
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          Cancel
        </button>
      </div>
      {error && (
        <p className={styles.flagFormError} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
