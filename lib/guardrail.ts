// Deterministic guardrail decision — shared by the API route AND the eval
// runner so "what the bot decides" is testable without calling an LLM.
//
// Layer 1 of the guardrail model (Layer 2 is the grounding system prompt):
//   • pricing intent            -> refuse (Cadre publishes no pricing)
//   • explicit human request    -> escalate (human handoff)
//   • weak / empty retrieval    -> escalate (covers off-topic + unknown)
//   • otherwise                 -> answer, grounded, with citations

import type { Retrieved } from "./types";
import { RETRIEVAL_THRESHOLD } from "./config";
import { isWeak } from "./retrieval";

export type DecisionMode = "answer" | "refuse" | "escalate";
export type DecisionReason =
  | "grounded"
  | "pricing"
  | "human_request"
  | "weak_retrieval";

export type Decision = {
  mode: DecisionMode;
  reason: DecisionReason;
  citations: string[]; // unique KB source filenames at/above threshold
  topScore: number;
};

const PRICING_RE =
  /\b(pric(e|ing|es)?|cost(s)?|how much|quote|fee(s)?|charge(s)?|dollar|budget|afford|expensive|cheap)\b|\$/i;

const HUMAN_RE =
  /\b(human|a person|real person|representative|rep|agent|talk to (a )?(person|someone|human)|speak (to|with)|contact (a|someone))\b/i;

export function decide(query: string, results: Retrieved[]): Decision {
  const topScore = results[0]?.score ?? 0;
  const citations = [
    ...new Set(
      results
        .filter((r) => r.score >= RETRIEVAL_THRESHOLD)
        .map((r) => r.chunk.meta.source),
    ),
  ];

  if (PRICING_RE.test(query)) {
    return { mode: "refuse", reason: "pricing", citations, topScore };
  }
  if (HUMAN_RE.test(query)) {
    return { mode: "escalate", reason: "human_request", citations, topScore };
  }
  if (isWeak(results)) {
    return { mode: "escalate", reason: "weak_retrieval", citations: [], topScore };
  }
  return { mode: "answer", reason: "grounded", citations, topScore };
}
