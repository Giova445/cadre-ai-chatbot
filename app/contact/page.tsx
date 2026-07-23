"use client";

import { useState } from "react";
import { BoxMark, Wordmark } from "../logo";

const CONTACT_EMAIL = "hello@gocadre.ai";

// Tier-0 lead capture: no backend. Captures intent client-side and points the
// user to the real contact channels. A live booking/CRM integration is a
// declared cut (see README).
export default function ContactPage() {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="shell">
      <header className="header">
        <div className="brand">
          <BoxMark className="brand-mark" />
          <Wordmark className="wordmark" />
        </div>
        <a className="cta-secondary" href="/">
          Back to the assistant
        </a>
      </header>

      <div style={{ padding: "36px 2px", display: "flex", flexDirection: "column", gap: 22, maxWidth: 560 }}>
        <h1 className="page-title">
          Talk to an <span style={{ color: "var(--red)" }}>AI Strategist</span>
        </h1>
        <p className="muted" style={{ margin: 0, fontSize: 15.5 }}>
          Tell us a little about your goals and we&apos;ll connect you with a
          Cadre AI strategist. Prefer email? Reach us at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>

        <div className="card">
          {submitted ? (
            <p className="muted" style={{ margin: 0 }}>
              Thanks, noted. Since this demo has no backend, please follow up at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and a
              strategist will take it from here.
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
                className="field"
                type="email"
                required
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <textarea
                className="field"
                placeholder="What would you like help with?"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
              />
              <button
                type="submit"
                className="cta"
                style={{ alignSelf: "flex-start", border: "none", cursor: "pointer" }}
              >
                Request a strategy call
                <span className="arrow" aria-hidden="true">
                  →
                </span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
