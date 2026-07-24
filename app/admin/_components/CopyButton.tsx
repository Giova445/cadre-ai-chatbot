"use client";

import { useState } from "react";
import styles from "../admin.module.css";

// Small copy-to-clipboard control (Admin § A2 "Copy" affordance). Prefers
// `navigator.clipboard.writeText`; falls back to a hidden-textarea +
// `document.execCommand("copy")` for older/locked-down browsers. Never
// throws — a failed copy just leaves the button unchanged (no crash).
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function onClick() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      className={styles.starterGhostBtn}
      onClick={() => void onClick()}
      aria-live="polite"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
