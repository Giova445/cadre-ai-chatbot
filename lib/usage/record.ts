// The metering write path. recordUsage computes cost then inserts ONE usage_events
// row. It is BEST-EFFORT by contract: the entire body is wrapped in try/catch and
// never throws — a metering write must never break a chat response (see the design
// stance in docs/product/usage-and-cost.md). Defaults: operation 'query',
// provider ev.provider ?? 'openai'.

import { computeCost } from "./cost";
import { usageRepo } from "./repo";
import type { UsageEventInput } from "./types";

export async function recordUsage(ev: UsageEventInput): Promise<void> {
  try {
    const { costNanoUsd, costSource } = computeCost(ev);
    await usageRepo.insertEvent({
      clientId: ev.clientId,
      conversationId: ev.conversationId,
      kind: ev.kind,
      operation: ev.operation ?? "query",
      provider: ev.provider ?? "openai",
      model: ev.model,
      inputTokens: ev.inputTokens ?? 0,
      outputTokens: ev.outputTokens ?? 0,
      cachedInputTokens: ev.cachedInputTokens ?? 0,
      costNanoUsd,
      costSource,
    });
  } catch (err) {
    // Fire-and-forget: log and swallow. Never surface a metering failure to chat.
    console.error("[usage] recordUsage failed (non-fatal):", err);
  }
}
