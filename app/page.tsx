"use client";

import { useRef, useState } from "react";

type Role = "user" | "assistant";
type Msg = {
  role: Role;
  content: string;
  sources?: string[];
  mode?: string; // answer | refuse | escalate
};

const SCENARIOS = [
  "What does Cadre AI do?",
  "What services do you offer?",
  "What is the AI Maturity Index?",
  "How do you choose LLMs and keep our data secure?",
  "How do I book a strategy call?",
  "How do I access the client portal?",
];

const CONTACT_URL = "/contact";
const CONTACT_EMAIL = "hello@gocadre.ai";

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

export default function Page() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  function scrollDown() {
    requestAnimationFrame(() => {
      const el = transcriptRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);

    const outgoing: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(outgoing);
    // Placeholder assistant message we stream into.
    setMessages((m) => [...m, { role: "assistant", content: "" }]);
    scrollDown();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: outgoing.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const mode = res.headers.get("x-cadre-mode") ?? "answer";
      let sources: string[] = [];
      try {
        sources = JSON.parse(res.headers.get("x-cadre-sources") ?? "[]");
      } catch {
        sources = [];
      }

      if (!res.ok || !res.body) {
        updateLast("Sorry — something went wrong. Please try again.", "escalate", []);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        updateLast(acc, mode, sources);
        scrollDown();
      }
      updateLast(acc, mode, sources);
    } catch {
      updateLast("Sorry — the network dropped. Please try again.", "escalate", []);
    } finally {
      setBusy(false);
      scrollDown();
    }
  }

  function updateLast(content: string, mode: string, sources: string[]) {
    setMessages((m) => {
      const copy = [...m];
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === "assistant") {
          copy[i] = { ...copy[i], content, mode, sources };
          break;
        }
      }
      return copy;
    });
  }

  const isEscalation = (m: Msg) => m.mode === "escalate" || m.mode === "refuse";

  return (
    <div className="shell">
      <div className="header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">C</span>
          <div className="brand-text">
            <h1>Cadre AI</h1>
            <span className="tag">Support Assistant · grounded in Cadre&apos;s docs</span>
          </div>
        </div>
        <span className="status">
          <span className="status-dot" aria-hidden="true" />
          Online
        </span>
      </div>

      <div
        className="transcript"
        ref={transcriptRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
      >
        {messages.length === 0 && (
          <div className="empty-state">
            <span className="brand-mark brand-mark-lg" aria-hidden="true">C</span>
            <h2>From AI Confusion to AI Confidence</h2>
            <p>
              Ask about Cadre AI&apos;s services, the AI Maturity Index, data
              security, or booking a strategy call. I only answer from
              Cadre&apos;s knowledge base — if I don&apos;t know, I&apos;ll
              connect you with the team.
            </p>
          </div>
        )}

        {messages.map((m, i) => {
          if (m.role === "assistant" && isEscalation(m) && m.content) {
            return (
              <div className="escalation" key={i}>
                <span className="escalation-icon" aria-hidden="true">!</span>
                <div className="escalation-body">
                  <p className="escalation-text">{m.content}</p>
                  <div className="escalation-actions">
                    <a className="cta" href={CONTACT_URL}>
                      Talk to an AI Strategist →
                    </a>
                    <a className="cta-secondary" href={`mailto:${CONTACT_EMAIL}`}>
                      or email {CONTACT_EMAIL}
                    </a>
                  </div>
                </div>
              </div>
            );
          }
          return (
            <div className={`msg-row ${m.role}`} key={i}>
              <span className="avatar" aria-hidden="true">
                {m.role === "user" ? "U" : "C"}
              </span>
              <div className={`msg ${m.role}`}>
                <span className="sr-only">
                  {m.role === "user" ? "You said" : "Cadre AI said"}:
                </span>
                {m.content ? (
                  <>
                    {m.content}
                    {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                      <div className="sources">
                        <span className="sources-label">Sources:</span>
                        {m.sources.map((s, si) => (
                          <span className="source-pill" key={si}>
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                ) : m.role === "assistant" && busy ? (
                  <span className="typing" aria-label="Cadre AI is typing">
                    <span></span>
                    <span></span>
                    <span></span>
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {messages.length === 0 && (
        <div className="chips">
          <span className="chips-label">Try asking</span>
          <div className="chips-grid">
            {SCENARIOS.map((s) => (
              <button className="chip" key={s} onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <div className="composer-field">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about Cadre AI…"
            aria-label="Message"
          />
          <button
            type="submit"
            className="send-btn"
            disabled={busy || !input.trim()}
            aria-label="Send message"
          >
            {busy ? <span className="spinner" aria-hidden="true" /> : <SendIcon />}
          </button>
        </div>
        <p className="disclaimer">Cadre AI can make mistakes. Verify anything critical.</p>
      </form>
    </div>
  );
}
