// The chat panel: transcript, composer, starter chips, and escalation CTA.
// Mirrors app/page.tsx's UX (empty state, streaming read loop, sources pills,
// typing indicator, escalation card) as vanilla DOM. XSS boundary: any text
// that came from the user or the model (chat content, starter-chip labels)
// is rendered via `textContent`, NEVER `innerHTML`.

import type { WidgetConfig } from "./config";
import { resolveStarters } from "@/lib/starters";
import { getOrCreateSessionId, loadHistory, saveHistory, type StoredMessage } from "./session";
import { sendMessage, type ChatMeta } from "./transport";
import { createSendIcon } from "./icons";

type UIMessage = StoredMessage & { mode?: string; sources?: string[] };

export type PanelStatus = "idle" | "thinking" | "online" | "error";

export type PanelController = {
  element: HTMLElement;
  focusComposer(): void;
  setStatus(status: PanelStatus): void;
};

const STATUS_COPY: Record<PanelStatus, string> = {
  idle: "Online",
  thinking: "Thinking…",
  online: "Online",
  error: "Offline",
};

export type PanelCallbacks = {
  onTurnComplete?: (meta: ChatMeta) => void;
};

const CONTACT_EMAIL = "hello@gocadre.ai";

function isEscalation(m: UIMessage): boolean {
  return m.mode === "escalate" || m.mode === "refuse";
}

function buildHeader(): {
  element: HTMLElement;
  closeButton: HTMLButtonElement;
  statusDot: HTMLSpanElement;
  statusLabel: HTMLSpanElement;
} {
  const header = document.createElement("div");
  header.className = "panel-header";

  const brand = document.createElement("div");
  brand.className = "panel-brand";
  const name = document.createElement("span");
  name.className = "panel-brand-name";
  name.textContent = "Cadre AI";
  const status = document.createElement("span");
  status.className = "panel-status";
  const dot = document.createElement("span");
  dot.className = "panel-status-dot";
  dot.setAttribute("aria-hidden", "true");
  const statusLabel = document.createElement("span");
  statusLabel.textContent = "Online";
  status.append(dot, statusLabel);
  brand.append(name, status);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "panel-close";
  closeButton.setAttribute("aria-label", "Close chat");
  closeButton.append(createCloseGlyph());

  header.append(brand, closeButton);
  return { element: header, closeButton, statusDot: dot, statusLabel };
}

// A tiny inline "x" built from DOM primitives (kept out of icons.ts since it's
// only used once, right here).
function createCloseGlyph(): HTMLElement {
  const span = document.createElement("span");
  span.setAttribute("aria-hidden", "true");
  span.textContent = "✕";
  return span;
}

function buildComposer(): {
  form: HTMLFormElement;
  input: HTMLInputElement;
  onSubmit: (cb: (text: string) => void) => void;
  onComposeFocus: (cb: () => void) => void;
  setBusy: (busy: boolean) => void;
} {
  const form = document.createElement("form");
  form.className = "composer";

  const field = document.createElement("div");
  field.className = "composer-field";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Ask about Cadre AI…";
  input.setAttribute("aria-label", "Message");
  input.autocomplete = "off";

  const sendBtn = document.createElement("button");
  sendBtn.type = "submit";
  sendBtn.className = "send-btn";
  sendBtn.setAttribute("aria-label", "Send message");
  sendBtn.disabled = true;
  sendBtn.append(createSendIcon());

  field.append(input, sendBtn);

  const disclaimer = document.createElement("p");
  disclaimer.className = "disclaimer";
  disclaimer.textContent =
    "Cadre AI's assistant answers from our docs and connects you with a strategist when it can't.";

  form.append(field, disclaimer);

  input.addEventListener("input", () => {
    sendBtn.disabled = input.value.trim().length === 0;
  });

  let focusHandler: (() => void) | null = null;
  input.addEventListener("focus", () => focusHandler?.());

  let submitHandler: ((text: string) => void) | null = null;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value;
    input.value = "";
    sendBtn.disabled = true;
    submitHandler?.(text);
  });

  return {
    form,
    input,
    onSubmit: (cb) => {
      submitHandler = cb;
    },
    onComposeFocus: (cb) => {
      focusHandler = cb;
    },
    setBusy: (busy) => {
      sendBtn.disabled = busy || input.value.trim().length === 0;
      input.disabled = busy;
    },
  };
}

function buildTypingIndicator(): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = "typing";
  wrap.setAttribute("aria-label", "Cadre AI is typing");
  wrap.append(document.createElement("span"), document.createElement("span"), document.createElement("span"));
  return wrap;
}

function buildSourcesRow(sources: readonly string[]): HTMLElement {
  const row = document.createElement("div");
  row.className = "sources";
  const label = document.createElement("span");
  label.className = "sources-label";
  label.textContent = "Sources:";
  row.append(label);
  for (const s of sources) {
    const pill = document.createElement("span");
    pill.className = "source-pill";
    pill.textContent = s; // filenames from our own trace headers, but still untrusted text over the wire
    row.append(pill);
  }
  return row;
}

function buildEscalationCard(text: string, contactUrl: string): HTMLElement {
  const card = document.createElement("div");
  card.className = "escalation";

  const icon = document.createElement("span");
  icon.className = "escalation-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "!";

  const body = document.createElement("div");
  body.className = "escalation-body";

  const p = document.createElement("p");
  p.className = "escalation-text";
  p.textContent = text;

  const actions = document.createElement("div");
  actions.className = "escalation-actions";

  const cta = document.createElement("a");
  cta.className = "cta";
  cta.href = contactUrl; // ABSOLUTE — points at OUR origin, never the host page's
  cta.target = "_blank";
  cta.rel = "noopener noreferrer";
  cta.append(document.createTextNode("Talk to an AI Strategist "));
  const arrow = document.createElement("span");
  arrow.className = "cta-arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "→";
  cta.append(arrow);

  const mailLink = document.createElement("a");
  mailLink.className = "cta-secondary";
  mailLink.href = `mailto:${CONTACT_EMAIL}`;
  mailLink.textContent = `or email ${CONTACT_EMAIL}`;

  actions.append(cta, mailLink);
  body.append(p, actions);
  card.append(icon, body);
  return card;
}

export function createPanel(cfg: WidgetConfig, callbacks: PanelCallbacks = {}): PanelController {
  const element = document.createElement("div");
  element.id = "cadre-panel";
  element.className = "cadre-panel";
  element.setAttribute("role", "dialog");
  element.setAttribute("aria-label", "Cadre AI chat");

  const {
    element: header,
    closeButton,
    statusDot,
    statusLabel,
  } = buildHeader();

  const transcript = document.createElement("div");
  transcript.className = "transcript";
  transcript.setAttribute("role", "log");
  transcript.setAttribute("aria-live", "polite");
  transcript.setAttribute("aria-label", "Conversation");

  const chipsWrap = document.createElement("div");
  chipsWrap.className = "chips";

  const composer = buildComposer();

  element.append(header, transcript, chipsWrap, composer.form);

  // NOTE: history restore is text-only (session.ts persists role/content, not
  // mode/sources) — a reloaded escalation renders as a plain assistant bubble.
  // This is a deliberate, documented limit of the zero-backend localStorage
  // resume (see docs/product/client-rollout-features.md § A "Session identity").
  let messages: UIMessage[] = loadHistory();
  let busy = false;

  function setStatus(s: PanelStatus): void {
    statusLabel.textContent = STATUS_COPY[s];
    statusDot.dataset.state = s;
  }

  // Initialise the dot to a real state so the CSS data-state selectors engage
  // (otherwise the dot is styled only by the generic base rule and the label
  // is a static "Online" that can drift out of sync with reality). "online"
  // = panel is live and ready to receive input.
  setStatus("online");

  function renderEmptyState(): void {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const title = document.createElement("p");
    title.className = "empty-title";
    title.textContent = cfg.greeting;
    empty.append(title);
    transcript.append(empty);
  }

  function renderChips(): void {
    chipsWrap.replaceChildren();
    if (messages.length > 0) return;
    const starters = resolveStarters({ snippet: cfg.starters });
    if (starters.length === 0) return;

    const label = document.createElement("span");
    label.className = "chips-label";
    label.textContent = "Try asking";

    const grid = document.createElement("div");
    grid.className = "chips-grid";
    for (const s of starters) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = s; // XSS boundary — starter labels are maker-configured text, never innerHTML
      chip.addEventListener("click", () => void send(s));
      grid.append(chip);
    }
    chipsWrap.append(label, grid);
  }

  function renderMessageRow(m: UIMessage): HTMLElement {
    if (m.role === "assistant" && isEscalation(m) && m.content) {
      return buildEscalationCard(m.content, cfg.contactUrl);
    }
    const row = document.createElement("div");
    row.className = `msg-row ${m.role}`;
    const bubble = document.createElement("div");
    bubble.className = `msg ${m.role}`;

    if (m.content) {
      const p = document.createElement("p");
      p.className = "msg-text";
      p.textContent = m.content; // model/user output — never innerHTML
      bubble.append(p);
      if (m.role === "assistant" && m.sources && m.sources.length > 0) {
        bubble.append(buildSourcesRow(m.sources));
      }
    } else if (m.role === "assistant" && busy) {
      bubble.append(buildTypingIndicator());
    }
    row.append(bubble);
    return row;
  }

  function renderMessages(): void {
    transcript.replaceChildren();
    if (messages.length === 0) {
      renderEmptyState();
    } else {
      for (const m of messages) transcript.append(renderMessageRow(m));
    }
    renderChips();
    transcript.scrollTop = transcript.scrollHeight;
  }

  function updateLastAssistant(content: string, mode?: string, sources?: string[]): void {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") {
        messages = [
          ...messages.slice(0, i),
          { ...messages[i], content, mode, sources },
          ...messages.slice(i + 1),
        ];
        break;
      }
    }
    renderMessages();
  }

  async function send(text: string): Promise<void> {
    const q = text.trim();
    if (!q || busy) return;
    busy = true;
    composer.setBusy(true);
    setStatus("thinking");

    messages = [...messages, { role: "user", content: q }, { role: "assistant", content: "" }];
    renderMessages();

    const sessionId = getOrCreateSessionId();
    const outgoing = messages
      .slice(0, -1) // exclude the empty assistant placeholder we just added
      .map(({ role, content }) => ({ role, content }));

    await sendMessage(
      cfg,
      outgoing,
      sessionId,
      {
        onDelta: (full) => updateLastAssistant(full),
        onDone: (full, meta) => {
          updateLastAssistant(full, meta.mode, meta.sources);
          saveHistory(messages.map(({ role, content }) => ({ role, content })));
          busy = false;
          composer.setBusy(false);
          setStatus("online");
          callbacks.onTurnComplete?.(meta);
        },
        onError: (message) => {
          updateLastAssistant(message, "escalate", []);
          busy = false;
          composer.setBusy(false);
          setStatus("error");
        },
      },
    );
  }

  composer.onSubmit((text) => void send(text));
  // When the user refocuses the composer after a failed turn, clear the stale
  // "Offline" indicator so the dot recovers green without needing a close +
  // reopen. Skipped mid-turn (busy) so an in-flight "Thinking…" isn't clobbered.
  composer.onComposeFocus(() => {
    if (!busy) setStatus("online");
  });
  closeButton.addEventListener("click", () => {
    element.dispatchEvent(new CustomEvent("cadre:close"));
  });

  renderMessages();

  return {
    element,
    focusComposer: () => composer.input.focus(),
    setStatus,
  };
}
