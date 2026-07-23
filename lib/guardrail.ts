// Deterministic guardrail decision — shared by the API route AND the eval
// runner so "what the bot decides" is testable without calling an LLM.
//
// Layer 1 of the guardrail model (Layer 2 is the grounding system prompt):
//   • pricing intent            -> refuse (Cadre publishes no pricing)
//   • explicit human request    -> escalate (human handoff)
//   • weak / empty retrieval    -> escalate (covers off-topic + unknown)
//   • answer's key terms absent  -> refuse (grounding-coverage guard: don't
//     confirm a specific thing the retrieved context doesn't actually mention;
//     this is what stops "do you offer <plausible-fake>?" from being answered)
//   • otherwise                 -> answer, grounded, with citations

import type { Retrieved } from "./types";
import { RETRIEVAL_THRESHOLD } from "./config";
import { isWeak } from "./retrieval";
import { tokenize } from "./llm";

export type DecisionMode = "answer" | "refuse" | "escalate";
export type DecisionReason =
  | "grounded"
  | "pricing"
  | "human_request"
  | "weak_retrieval"
  | "unsupported";

export type Decision = {
  mode: DecisionMode;
  reason: DecisionReason;
  citations: string[]; // unique KB source filenames at/above threshold
  topScore: number;
  coverage: number; // fraction of distinctive query terms present in context
};

// Pricing intent. Deliberately targets clear pricing words; "budget"/"afford"
// were dropped to avoid over-refusing legitimate finance/ROI questions.
const PRICING_RE =
  /\b(pric(e|ing|es)?|cost(s)?|how much|quote|fee(s)?|charge(s)?|rate(s)?|retainer|dollar|expensive|cheap)\b|\$/i;

// Explicit request for a person. The human object is required so "speak to our
// CRM" or "connect to your API" don't trip the human-handoff path.
const HUMAN_RE =
  /\b(human|real person|representative|(talk|speak) (to|with) (a |an |the )?(person|someone|human|rep|representative|agent|advisor|strategist|team|expert)|contact (a person|a human|someone))\b/i;

// Terms too ubiquitous across the KB to be evidence that a SPECIFIC thing is
// supported by the retrieved context.
const UBIQUITOUS = new Set([
  "cadre", "ai", "offer", "offers", "provide", "provides", "help", "service",
  "services", "company", "business",
]);

// Minimum fraction of distinctive query terms that must appear in the retrieved
// context for an answer to be considered grounded. Below it, refuse rather than
// confirm something the docs don't actually mention.
const COVERAGE_MIN = 0.4;

function coverage(query: string, results: Retrieved[]): number {
  const terms = [...new Set(tokenize(query))].filter((t) => !UBIQUITOUS.has(t));
  if (terms.length === 0) return 1;
  // Token-boundary match (not substring) so "command" can't be satisfied by
  // "commander" and partial overlaps don't inflate coverage.
  const contextTokens = new Set(results.flatMap((r) => tokenize(r.chunk.text)));
  const found = terms.filter((t) => contextTokens.has(t)).length;
  return found / terms.length;
}

export function decide(query: string, results: Retrieved[]): Decision {
  const topScore = results[0]?.score ?? 0;
  const cov = coverage(query, results);
  const citations = [
    ...new Set(
      results
        .filter((r) => r.score >= RETRIEVAL_THRESHOLD)
        .map((r) => r.chunk.meta.source),
    ),
  ];

  if (PRICING_RE.test(query)) {
    return { mode: "refuse", reason: "pricing", citations, topScore, coverage: cov };
  }
  if (HUMAN_RE.test(query)) {
    return { mode: "escalate", reason: "human_request", citations, topScore, coverage: cov };
  }
  if (isWeak(results)) {
    return { mode: "escalate", reason: "weak_retrieval", citations: [], topScore, coverage: cov };
  }
  // Retrieval is above threshold, but if the query's distinctive terms aren't
  // actually present in the retrieved text, don't confirm — refuse gracefully.
  if (cov < COVERAGE_MIN) {
    return { mode: "refuse", reason: "unsupported", citations, topScore, coverage: cov };
  }
  return { mode: "answer", reason: "grounded", citations, topScore, coverage: cov };
}
