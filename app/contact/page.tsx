"use client";

import { useState } from "react";

const CONTACT_EMAIL = "hello@gocadre.ai";

// Tier-0 lead capture: no backend. Captures intent client-side and points the
// user to the real contact channels. (A live booking/CRM integration is a
// declared cut — see README.)
export default function ContactPage() {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="shell">
      <div className="header">
        <h1>Talk to an AI Strategist</h1>
        <span className="tag">Cadre AI</span>
      </div>

      <div style={{ padding: "24px 2px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="card">
          <p style={{ marginTop: 0 }}>
            Tell us a little about your goals and we&apos;ll connect you with a Cadre
            AI strategist. Prefer email? Reach us directly at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>

          {submitted ? (
            <p className="muted">
              Thanks — noted. Since this demo has no backend, please follow up at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and a strategist
              will take it from here.
            </p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSubmitted(true);
              }}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <input
                className="composer-input"
                type="email"
                required
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  background: "var(--panel-2)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  borderRadius: 12,
                  padding: "12px 14px",
                  fontSize: 15,
                }}
              />
              <textarea
                placeholder="What would you like help with?"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                style={{
                  background: "var(--panel-2)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  borderRadius: 12,
                  padding: "12px 14px",
                  fontSize: 15,
                  fontFamily: "inherit",
                }}
              />
              <button
                type="submit"
                style={{
                  background: "var(--accent)",
                  color: "white",
                  border: "none",
                  borderRadius: 12,
                  padding: "12px 18px",
                  fontSize: 15,
                  cursor: "pointer",
                  alignSelf: "flex-start",
                }}
              >
                Request a strategy call
              </button>
            </form>
          )}
        </div>

        <a href="/" className="muted" style={{ textDecoration: "none" }}>
          ← Back to the assistant
        </a>
      </div>
    </div>
  );
}
