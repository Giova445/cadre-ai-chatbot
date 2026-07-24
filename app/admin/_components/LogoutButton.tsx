"use client";

import { useState } from "react";
import { LogoutIcon } from "./Icons";
import styles from "../admin.module.css";

// Small client island so the rest of the admin chrome can stay a Server
// Component. Best-effort DELETE to clear the signed admin cookie, then a hard
// navigation to /admin/login (avoids stale RSC/client cache after logout).
export function LogoutButton() {
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    if (pending) return;
    setPending(true);
    try {
      await fetch("/api/admin/login", { method: "DELETE" });
    } catch {
      // Ignore network errors — still navigate to login below.
    } finally {
      window.location.href = "/admin/login";
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className={styles.logoutBtn}
      disabled={pending}
      aria-label="Sign out"
    >
      <LogoutIcon size={14} />
      <span>{pending ? "Signing out…" : "Sign out"}</span>
    </button>
  );
}
