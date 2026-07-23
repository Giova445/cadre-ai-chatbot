"use client";

// Admin login — a small brand-styled password form. Client component: POSTs the
// password to /api/admin/login and, on success, routes into the dashboard. It is
// pure UX; the real gate is requireAdmin() server-side in each admin route/RSC.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BoxMark, Wordmark } from "@/app/logo";

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
    <div className="shell">
      <div style={{ margin: "auto", width: "100%", maxWidth: 380 }}>
        <div
          className="brand"
          style={{ justifyContent: "center", marginBottom: 24 }}
        >
          <BoxMark className="brand-mark" />
          <Wordmark className="wordmark" />
          <span className="brand-label">Admin</span>
        </div>

        <div className="card">
          <h1 className="page-title" style={{ fontSize: 22, marginBottom: 6 }}>
            Sign in
          </h1>
          <p
            className="muted"
            style={{ margin: "0 0 18px", fontSize: 14 }}
          >
            Enter the admin password to view conversations and retrieval traces.
          </p>

          <form
            onSubmit={onSubmit}
            style={{ display: "flex", flexDirection: "column", gap: 12 }}
          >
            <input
              className="field"
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
            />

            {error ? (
              <p
                role="alert"
                style={{ margin: 0, color: "var(--red-ink)", fontSize: 13.5 }}
              >
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              className="cta"
              disabled={submitting || password.length === 0}
              style={{
                justifyContent: "center",
                border: "none",
                cursor: submitting ? "wait" : "pointer",
                opacity: submitting || password.length === 0 ? 0.55 : 1,
              }}
            >
              {submitting ? "Signing in…" : "Sign in"}
              <span className="arrow" aria-hidden="true">
                →
              </span>
            </button>
          </form>
        </div>

        <p
          className="muted"
          style={{ textAlign: "center", margin: "16px 0 0", fontSize: 12 }}
        >
          Cadre · Admin
        </p>
      </div>
    </div>
  );
}
