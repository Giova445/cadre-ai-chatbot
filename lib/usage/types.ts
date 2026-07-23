// Frozen usage/cost contracts (shared by the repo, route instrumentation, and the
// admin report). Content-free by design: tokens + cost only, never prompt text.

export type UsageKind = "chat" | "embedding";
export type CostSource = "provider_reported" | "table_estimated";

// One billable model call, before cost is computed/stored.
export type UsageEventInput = {
  clientId: string;
  conversationId: string | null; // session grain; null for build-time ingest
  kind: UsageKind;
  operation?: "query" | "ingest";
  provider?: string; // "openai" | "openrouter" | "lexical"
  model: string;
  inputTokens: number;
  outputTokens?: number; // 0 for embeddings
  cachedInputTokens?: number;
  rawCostUsd?: number | null; // provider-reported cost (OpenRouter usage.raw.cost) if present
};

export type CostBreakdown = { costNanoUsd: number; costSource: CostSource };

// ---- Read models (admin report) ----
export type UsageRollup = {
  inputTokens: number;
  outputTokens: number;
  embedTokens: number;
  requests: number;
  costNanoUsd: number;
};

export type ClientUsageRow = {
  clientId: string;
  requests: number;
  llmCostUsd: number; // chat spend
  embedCostUsd: number; // embedding spend (kept separate per deliverable #6)
  monthCostUsd: number; // llm + embed for the current month
  lastActivityAt: string | null;
};

export type ConversationCostRow = {
  conversationId: string;
  clientId: string;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  embedTokens: number;
  costUsd: number;
  lastTs: string;
};

export type DayUsageRow = {
  date: string; // YYYY-MM-DD
  inputTokens: number;
  outputTokens: number;
  embedTokens: number;
  requests: number;
  costUsd: number;
};

// ---- Budgets + balance ----
export type Budget = {
  scope: "global" | "client";
  clientId: string; // "" for global
  monthlyCeilingNanoUsd: number; // 0 = unlimited
  warnPct: number;
  softBlock: boolean;
};

export type BudgetStatus = {
  blocked: boolean; // over 100% AND softBlock
  usedNanoUsd: number;
  ceilingNanoUsd: number; // 0 = unlimited
  pct: number; // 0 when unlimited
  status: "ok" | "warn" | "over";
  softBlock: boolean;
};

// Provider balance. For OpenAI (no endpoint) balanceAvailable=false, remainingUsd=null;
// spendToDateUsd is always computed from usage_events. For OpenRouter, /credits fills it.
export type BalanceInfo = {
  provider: string;
  balanceAvailable: boolean;
  remainingUsd: number | null;
  spendToDateUsd: number;
  note: string;
};
