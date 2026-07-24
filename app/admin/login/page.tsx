"use client";

// Admin login — dark-sand to match the admin (kills the jarring theme jump
// from light login to dark admin). All styling lives in admin.module.css:
// no inline styles, no globals.css inheritance. The login is a self-contained
// surface (the protected layout has its own dark .root scope that globals'
// light .shell would fight).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BoxMark, Wordmark } from "@/app/logo";
import { ForwardIcon } from "../_components/Icons";
import styles from "../admin.module.css";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || password.length === 0) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push("/admin/conversations");
        router.refresh();
        return;
      }
      setError(
        res.status === 401
          ? "Incorrect password. Please try again."
          : "Sign-in failed. Please try again.",
      );
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`${styles.root} ${styles.loginShell}`}>
      <div className={styles.grain} aria-hidden />
      <div className={styles.loginBody}>
        <div className={styles.loginBrand}>
          <BoxMark className={styles.loginBrandMark} />
          <Wordmark className={styles.loginWordmark} />
          <span className={styles.loginBrandLabel}>Admin</span>
        </div>

        <div className={styles.loginCard}>
          <h1 className={styles.loginTitle}>Sign in</h1>
          <p className={styles.loginSub}>
            Enter the admin password to view conversations and retrieval traces.
          </p>

          <form className={styles.loginForm} onSubmit={onSubmit}>
            <input
              className={styles.loginField}
              type="password"
              name="password"
              autoComplete="current-password"
              autoFocus
              required
              placeholder="Admin password"
              aria-label="Admin password"
              aria-invalid={error ? true : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
            />

            {error ? (
              <p role="alert" className={styles.loginError}>
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              className={styles.loginCta}
              disabled={submitting || password.length === 0}
            >
              {submitting ? "Signing in…" : "Sign in"}
              <span className={styles.loginArrow} aria-hidden>
                <ForwardIcon size={14} />
              </span>
            </button>
          </form>
        </div>

        <p className={styles.loginFooter}>Cadre · Admin</p>
      </div>
    </div>
  );
}
