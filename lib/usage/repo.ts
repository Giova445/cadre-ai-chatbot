// Read-only usage repository (plus the single insert on the metering write path),
// backed by Supabase Postgres via getDb(). Mirrors lib/admin/repos.ts: every
// query is SELECT-only except insertEvent; all row→read-model shaping lives in
// pure mappers (mapClientUsageRow / mapDayUsageRow / …) so the contract is
// unit-testable without a live connection. Cost is stored as integer nano-USD
// and converted to USD ONLY at this boundary via nanoToUsd.

import { getDb } from "../db";
import { nanoToUsd } from "./cost";
import type {
  Budget,
  ClientUsageRow,
  ConversationCostRow,
  CostSource,
  DayUsageRow,
  UsageKind,
  UsageRollup,
} from "./types";

// ---------------------------------------------------------------------------
// Insert row (what record.ts hands us — cost already computed by the caller).
// ---------------------------------------------------------------------------
export type InsertEventRow = {
  clientId: string;
  conversationId: string | null;
  kind: UsageKind;
  operation: "query" | "ingest";
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  costNanoUsd: number;
  costSource: CostSource;
};

// ---------------------------------------------------------------------------
// Raw DB row shapes (snake_case). Numeric columns are `number | string` because
// the pg driver returns bigint/count as strings; mappers coerce with Number().
// ---------------------------------------------------------------------------
export type ClientUsageQueryRow = {
  client_id: string;
  requests: number | string;
  llm_cost_nano: number | string;
  embed_cost_nano: number | string;
  month_cost_nano: number | string;
  last_activity_at: Date | string | null;
};

export type DayUsageQueryRow = {
  date: string; // 'YYYY-MM-DD'
  input_tokens: number | string;
  output_tokens: number | string;
  embed_tokens: number | string;
  requests: number | string;
  cost_nano: number | string;
};

export type ConversationCostQueryRow = {
  conversation_id: string;
  client_id: string;
  turns: number | string;
  input_tokens: number | string;
  output_tokens: number | string;
  embed_tokens: number | string;
  cost_nano: number | string;
  last_ts: Date | string;
};

export type ModelCostQueryRow = { model: string; cost_nano: number | string };

export type BudgetQueryRow = {
  scope: string;
  client_id: string;
  monthly_ceiling_nano_usd: number | string;
  warn_pct: number | string;
  soft_block: boolean;
};

// ---------------------------------------------------------------------------
// Pure mappers (no DB) — the tested seam.
// ---------------------------------------------------------------------------
export function mapClientUsageRow(r: ClientUsageQueryRow): ClientUsageRow {
  return {
    clientId: r.client_id,
    requests: Number(r.requests),
    llmCostUsd: nanoToUsd(Number(r.llm_cost_nano)),
    embedCostUsd: nanoToUsd(Number(r.embed_cost_nano)),
    monthCostUsd: nanoToUsd(Number(r.month_cost_nano)),
    lastActivityAt: r.last_activity_at ? new Date(r.last_activity_at).toISOString() : null,
  };
}

export function mapDayUsageRow(r: DayUsageQueryRow): DayUsageRow {
  return {
    date: r.date,
    inputTokens: Number(r.input_tokens),
    outputTokens: Number(r.output_tokens),
    embedTokens: Number(r.embed_tokens),
    requests: Number(r.requests),
    costUsd: nanoToUsd(Number(r.cost_nano)),
  };
}

export function mapConversationCostRow(r: ConversationCostQueryRow): ConversationCostRow {
  return {
    conversationId: r.conversation_id,
    clientId: r.client_id,
    turns: Number(r.turns),
    inputTokens: Number(r.input_tokens),
    outputTokens: Number(r.output_tokens),
    embedTokens: Number(r.embed_tokens),
    costUsd: nanoToUsd(Number(r.cost_nano)),
    lastTs: new Date(r.last_ts).toISOString(),
  };
}

export function mapModelCostRow(r: ModelCostQueryRow): { model: string; costUsd: number } {
  return { model: r.model, costUsd: nanoToUsd(Number(r.cost_nano)) };
}

export function mapBudgetRow(r: BudgetQueryRow): Budget {
  return {
    scope: r.scope === "global" ? "global" : "client",
    clientId: r.client_id,
    monthlyCeilingNanoUsd: Number(r.monthly_ceiling_nano_usd),
    warnPct: Number(r.warn_pct),
    softBlock: Boolean(r.soft_block),
  };
}

/** Fold day rows into totals. Totals keep nano-USD (UsageRollup.costNanoUsd). */
export function rollupDays(rows: readonly DayUsageQueryRow[]): UsageRollup {
  return rows.reduce<UsageRollup>(
    (acc, r) => ({
      inputTokens: acc.inputTokens + Number(r.input_tokens),
      outputTokens: acc.outputTokens + Number(r.output_tokens),
      embedTokens: acc.embedTokens + Number(r.embed_tokens),
      requests: acc.requests + Number(r.requests),
      costNanoUsd: acc.costNanoUsd + Number(r.cost_nano),
    }),
    { inputTokens: 0, outputTokens: 0, embedTokens: 0, requests: 0, costNanoUsd: 0 },
  );
}

// ---------------------------------------------------------------------------
// Repository implementation.
// ---------------------------------------------------------------------------
async function insertEvent(row: InsertEventRow): Promise<void> {
  const sql = getDb();
  await sql`
    insert into usage_events (
      client_id, conversation_id, kind, operation, provider, model,
      input_tokens, output_tokens, cached_input_tokens, cost_nano_usd, cost_source
    ) values (
      ${row.clientId}, ${row.conversationId}, ${row.kind}, ${row.operation},
      ${row.provider}, ${row.model}, ${row.inputTokens}, ${row.outputTokens},
      ${row.cachedInputTokens}, ${row.costNanoUsd}, ${row.costSource}
    )
  `;
}

/** Sum cost_nano_usd for a calendar month. clientId null = global (all clients). */
async function monthSpendNano(clientId: string | null, yyyymm: string): Promise<number> {
  const sql = getDb();
  const cFilter = clientId === null ? sql`` : sql`and client_id = ${clientId}`;
  const rows = await sql<{ total: number | string }[]>`
    select coalesce(sum(cost_nano_usd), 0) as total
    from usage_events
    where to_char(ts, 'YYYY-MM') = ${yyyymm} ${cFilter}
  `;
  return Number(rows[0]?.total ?? 0);
}

/** All-time global spend in nano-USD (used by balance's "spend to date"). */
async function totalSpendNano(): Promise<number> {
  const sql = getDb();
  const rows = await sql<{ total: number | string }[]>`
    select coalesce(sum(cost_nano_usd), 0) as total from usage_events
  `;
  return Number(rows[0]?.total ?? 0);
}

/** Per-client rollup for one month: requests, llm/embed/total cost, last activity. */
async function clientsOverview(yyyymm: string): Promise<ClientUsageRow[]> {
  const sql = getDb();
  const rows = await sql<ClientUsageQueryRow[]>`
    select
      client_id,
      count(*) as requests,
      coalesce(sum(case when kind = 'chat' then cost_nano_usd else 0 end), 0) as llm_cost_nano,
      coalesce(sum(case when kind = 'embedding' then cost_nano_usd else 0 end), 0) as embed_cost_nano,
      coalesce(sum(cost_nano_usd), 0) as month_cost_nano,
      max(ts) as last_activity_at
    from usage_events
    where to_char(ts, 'YYYY-MM') = ${yyyymm}
    group by client_id
    order by month_cost_nano desc
  `;
  return rows.map(mapClientUsageRow);
}

/** Per-day breakdown + totals + cost-by-model over an inclusive date range. */
async function usageReport(q: {
  clientId?: string;
  from: string; // 'YYYY-MM-DD'
  to: string; // 'YYYY-MM-DD'
}): Promise<{ days: DayUsageRow[]; totals: UsageRollup; byModel: { model: string; costUsd: number }[] }> {
  const sql = getDb();
  // chat tokens split from embedding tokens; embed tokens = input_tokens where kind='embedding'.
  const cFilter = q.clientId ? sql`and client_id = ${q.clientId}` : sql``;
  const rangeFilter = sql`ts::date >= ${q.from} and ts::date <= ${q.to}`;

  const [dayRows, modelRows] = await Promise.all([
    sql<DayUsageQueryRow[]>`
      select
        to_char(date_trunc('day', ts), 'YYYY-MM-DD') as date,
        coalesce(sum(case when kind = 'chat' then input_tokens else 0 end), 0) as input_tokens,
        coalesce(sum(case when kind = 'chat' then output_tokens else 0 end), 0) as output_tokens,
        coalesce(sum(case when kind = 'embedding' then input_tokens else 0 end), 0) as embed_tokens,
        count(*) as requests,
        coalesce(sum(cost_nano_usd), 0) as cost_nano
      from usage_events
      where ${rangeFilter} ${cFilter}
      group by 1
      order by 1 asc
    `,
    sql<ModelCostQueryRow[]>`
      select model, coalesce(sum(cost_nano_usd), 0) as cost_nano
      from usage_events
      where ${rangeFilter} ${cFilter}
      group by model
      order by cost_nano desc
    `,
  ]);

  return {
    days: dayRows.map(mapDayUsageRow),
    totals: rollupDays(dayRows),
    byModel: modelRows.map(mapModelCostRow),
  };
}

/** Per-conversation cost rollup for one client, most-recent first. */
async function conversationCosts(clientId: string, limit: number): Promise<ConversationCostRow[]> {
  const sql = getDb();
  const rows = await sql<ConversationCostQueryRow[]>`
    select
      conversation_id,
      client_id,
      count(*) filter (where kind = 'chat') as turns,
      coalesce(sum(case when kind = 'chat' then input_tokens else 0 end), 0) as input_tokens,
      coalesce(sum(case when kind = 'chat' then output_tokens else 0 end), 0) as output_tokens,
      coalesce(sum(case when kind = 'embedding' then input_tokens else 0 end), 0) as embed_tokens,
      coalesce(sum(cost_nano_usd), 0) as cost_nano,
      max(ts) as last_ts
    from usage_events
    where client_id = ${clientId} and conversation_id is not null
    group by conversation_id, client_id
    order by last_ts desc
    limit ${limit}
  `;
  return rows.map(mapConversationCostRow);
}

async function getBudget(scope: "global" | "client", clientId: string): Promise<Budget | null> {
  const sql = getDb();
  const rows = await sql<BudgetQueryRow[]>`
    select scope, client_id, monthly_ceiling_nano_usd, warn_pct, soft_block
    from usage_budgets
    where scope = ${scope} and client_id = ${clientId}
    limit 1
  `;
  return rows[0] ? mapBudgetRow(rows[0]) : null;
}

async function setBudget(b: Budget): Promise<void> {
  const sql = getDb();
  await sql`
    insert into usage_budgets (scope, client_id, monthly_ceiling_nano_usd, warn_pct, soft_block, updated_at)
    values (${b.scope}, ${b.clientId}, ${b.monthlyCeilingNanoUsd}, ${b.warnPct}, ${b.softBlock}, now())
    on conflict (scope, client_id) do update set
      monthly_ceiling_nano_usd = excluded.monthly_ceiling_nano_usd,
      warn_pct = excluded.warn_pct,
      soft_block = excluded.soft_block,
      updated_at = now()
  `;
}

async function listBudgets(): Promise<Budget[]> {
  const sql = getDb();
  const rows = await sql<BudgetQueryRow[]>`
    select scope, client_id, monthly_ceiling_nano_usd, warn_pct, soft_block
    from usage_budgets
    order by scope asc, client_id asc
  `;
  return rows.map(mapBudgetRow);
}

/** Singleton repo — the app imports this. */
export const usageRepo = {
  insertEvent,
  monthSpendNano,
  totalSpendNano,
  clientsOverview,
  usageReport,
  conversationCosts,
  getBudget,
  setBudget,
  listBudgets,
};
