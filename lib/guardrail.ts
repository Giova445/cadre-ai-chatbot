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
import { RETRIEVAL_THRESHOLD, HAS_CHAT_KEY } from "./config";
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
// and a bare "$" were dropped — a lone dollar sign matches legitimate finance/
// ROI/lead questions ("we spend $10k/month on ads, can you help?"), which are
// exactly the high-value conversations to answer/escalate, not deflect.
const PRICING_RE =
  /\b(pric(e|ing|es)?|cost(s)?|how much|quote|fee(s)?|charge(s)?|rate(s)?|retainer|dollar|expensive|cheap)\b/i;

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

// Sources are listed (for the retrieval trace) whenever a chunk clears this low
// relevance floor. This is INDEPENDENT of RETRIEVAL_THRESHOLD (which only gates
// answer-vs-escalate), so the cited-sources trace reflects real retrieved
// context even when the answer threshold is high (offline mode).
const CITATION_FLOOR = 0.05;

function coverage(query: string, results: Retrieved[]): number {
  const terms = [...new Set(tokenize(query))].filter((t) => !UBIQUITOUS.has(t));
  if (terms.length === 0) return 1;
  // Token-boundary match (not substring) so "command" can't be satisfied by
  // "commander" and partial overlaps don't inflate coverage.
  const contextTokens = new Set(results.flatMap((r) => tokenize(r.chunk.text)));
  const found = terms.filter((t) => contextTokens.has(t)).length;
  return found / terms.length;
}

export function decide(
  query: string,
  results: Retrieved[],
  threshold: number = RETRIEVAL_THRESHOLD,
): Decision {
  const topScore = results[0]?.score ?? 0;
  const cov = coverage(query, results);
  const citations = [
    ...new Set(
      results
        .filter((r) => r.score >= CITATION_FLOOR)
        .map((r) => r.chunk.meta.source),
    ),
  ];

  if (PRICING_RE.test(query)) {
    return { mode: "refuse", reason: "pricing", citations, topScore, coverage: cov };
  }
  if (HUMAN_RE.test(query)) {
    return { mode: "escalate", reason: "human_request", citations, topScore, coverage: cov };
  }
  if (isWeak(results, threshold)) {
    return { mode: "escalate", reason: "weak_retrieval", citations: [], topScore, coverage: cov };
  }
  // Grounding-coverage guard (OFFLINE ONLY). With no chat model, retrieval is
  // the only defense against confirming a fake ("do you offer <X>?"), so if the
  // query's distinctive terms are absent from context, refuse. Online, the LLM's
  // system-prompt grounding handles this far better, and this lexical guard
  // otherwise over-refuses legitimately phrased questions (e.g. ones that carry
  // formatting instructions whose words aren't in the KB).
  if (!HAS_CHAT_KEY && cov < COVERAGE_MIN) {
    return { mode: "refuse", reason: "unsupported", citations, topScore, coverage: cov };
  }
  return { mode: "answer", reason: "grounded", citations, topScore, coverage: cov };
}
