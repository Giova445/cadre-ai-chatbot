// Deterministic response text for the paths that do NOT call the chat model:
// refusals, escalations, and the offline grounded stub (when no chat key is set).
// Keeping this copy here makes the guardrail behavior testable and on-brand.

import type { Decision } from "./guardrail";
import type { Retrieved } from "./types";
import { CONTACT_EMAIL, CONTACT_URL, STRATEGIST_CTA } from "./config";

const CTA = `You can ${STRATEGIST_CTA.toLowerCase()} at ${CONTACT_URL}, or email us at ${CONTACT_EMAIL}.`;

export function pricingRefusal(): string {
  return `Cadre AI doesn't publish set pricing — engagements are scoped to each client's goals, so I can't quote a number here. The best next step is to talk it through with our team. ${CTA}`;
}

export function humanHandoff(): string {
  return `Happy to connect you with a person on the Cadre team. ${CTA}`;
}

export function weakRetrievalEscalation(): string {
  return `I don't have that in our docs, so I don't want to guess. Let me connect you with someone who can help. ${CTA}`;
}

/** Offline grounded answer: quote the top retrieved context and cite it. */
export function groundedStub(context: Retrieved[]): string {
  if (context.length === 0) return weakRetrievalEscalation();
  const top = context[0];
  const body = top.chunk.text.replace(/\s+/g, " ").trim();
  const snippet = body.length > 700 ? body.slice(0, 700).trimEnd() + "…" : body;
  return `${snippet}\n\n(source: ${top.chunk.meta.source})`;
}

/** Pick the right deterministic text for a non-answer decision. */
export function responseForDecision(decision: Decision): string {
  switch (decision.reason) {
    case "pricing":
      return pricingRefusal();
    case "human_request":
      return humanHandoff();
    case "weak_retrieval":
    default:
      return weakRetrievalEscalation();
  }
}
