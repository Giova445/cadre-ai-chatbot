// Pure cost calculation. Integer nano-USD (1e-9 USD) so accumulation never drifts.
import { rateFor } from "./pricing";
import type { UsageEventInput, CostBreakdown } from "./types";

const NANO = 1e9;

/**
 * Cost for one billable call, in integer nano-USD.
 *  1. Provider-reported (OpenRouter usage.raw.cost) → trust it verbatim.
 *  2. Else tokens × published rate. OpenAI returns no per-call cost, so the dated
 *     pricing table is authoritative there.
 * Absent/undefined tokens coalesce to 0 → never NaN. Unknown model → 0 (logged upstream).
 */
export function computeCost(ev: UsageEventInput): CostBreakdown {
  if (typeof ev.rawCostUsd === "number" && ev.rawCostUsd >= 0) {
    return { costNanoUsd: Math.round(ev.rawCostUsd * NANO), costSource: "provider_reported" };
  }
  const rate = rateFor(ev.model);
  if (!rate) return { costNanoUsd: 0, costSource: "table_estimated" };

  const input = ev.inputTokens ?? 0;
  const cached = Math.min(ev.cachedInputTokens ?? 0, input);
  const nonCached = Math.max(0, input - cached);
  const output = ev.outputTokens ?? 0;

  // USD per token = perMTok / 1e6; nano-USD = ×1e9 ⇒ multiply perMTok by 1e3.
  const nano =
    nonCached * rate.inputPerMTokUsd * 1e3 +
    cached * rate.cachedInputPerMTokUsd * 1e3 +
    output * rate.outputPerMTokUsd * 1e3;

  return { costNanoUsd: Math.round(nano), costSource: "table_estimated" };
}

export function nanoToUsd(nano: number): number {
  return nano / NANO;
}
