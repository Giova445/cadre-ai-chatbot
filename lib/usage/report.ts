// Thin admin read facade. The Pillar 2 dashboard consumes these; all shaping and
// nano→USD conversion already happen in usageRepo. These functions only choose
// the period and delegate.

import { currentYyyymm } from "./budget";
import { usageRepo } from "./repo";
import type { ClientUsageRow, ConversationCostRow, DayUsageRow, UsageRollup } from "./types";

/** Per-client overview for the current calendar month. */
export function getClientsOverview(): Promise<ClientUsageRow[]> {
  return usageRepo.clientsOverview(currentYyyymm());
}

/** Per-day usage + totals + cost-by-model over an inclusive date range. */
export function getUsageReport(q: {
  clientId?: string;
  from: string; // 'YYYY-MM-DD'
  to: string; // 'YYYY-MM-DD'
}): Promise<{ days: DayUsageRow[]; totals: UsageRollup; byModel: { model: string; costUsd: number }[] }> {
  return usageRepo.usageReport(q);
}

/** Per-conversation cost rollup for one client, most-recent first. */
export function getConversationCosts(clientId: string, limit: number): Promise<ConversationCostRow[]> {
  return usageRepo.conversationCosts(clientId, limit);
}
