// Pure tests for the budget-status math and the repo mappers — no DB. These pin
// the two contracts the metering path depends on: unlimited never blocks, the
// warn/over thresholds fire at the right percentages, soft-block only latches at
// >=100%, and row→read-model coercion (bigint strings → numbers, nano → USD).

import { describe, it, expect } from "vitest";
import { budgetStatus, evaluateThresholds } from "@/lib/usage/budget";
import {
  mapClientUsageRow,
  mapConversationCostRow,
  mapDayUsageRow,
  mapBudgetRow,
  rollupDays,
  type ClientUsageQueryRow,
  type ConversationCostQueryRow,
  type DayUsageQueryRow,
  type BudgetQueryRow,
} from "@/lib/usage/repo";

describe("budgetStatus — pure", () => {
  it("unlimited (ceiling 0) never blocks and reports pct 0", () => {
    const s = budgetStatus(999_999_999, 0, 80, true);
    expect(s).toEqual({
      blocked: false,
      usedNanoUsd: 999_999_999,
      ceilingNanoUsd: 0,
      pct: 0,
      status: "ok",
      softBlock: true,
    });
  });

  it("negative/invalid ceiling is treated as unlimited", () => {
    expect(budgetStatus(500, -5, 80, true).status).toBe("ok");
    expect(budgetStatus(500, -5, 80, true).blocked).toBe(false);
  });

  it("79% → ok", () => {
    const s = budgetStatus(79, 100, 80, true);
    expect(s.status).toBe("ok");
    expect(s.pct).toBeCloseTo(79, 9);
    expect(s.blocked).toBe(false);
  });

  it("80% → warn (at threshold, inclusive)", () => {
    const s = budgetStatus(80, 100, 80, true);
    expect(s.status).toBe("warn");
    expect(s.blocked).toBe(false);
  });

  it("100% → over, and blocked when softBlock on", () => {
    const s = budgetStatus(100, 100, 80, true);
    expect(s.status).toBe("over");
    expect(s.blocked).toBe(true);
  });

  it("120% → over", () => {
    const s = budgetStatus(120, 100, 80, true);
    expect(s.status).toBe("over");
    expect(s.pct).toBeCloseTo(120, 9);
    expect(s.blocked).toBe(true);
  });

  it("over ceiling but softBlock OFF → over, not blocked", () => {
    const s = budgetStatus(150, 100, 80, false);
    expect(s.status).toBe("over");
    expect(s.blocked).toBe(false);
  });
});

describe("evaluateThresholds — pure", () => {
  it("returns [] when unlimited", () => {
    expect(evaluateThresholds(0, 999, 0, 80)).toEqual([]);
  });

  it("crossing the warn mark returns [warnPct]", () => {
    expect(evaluateThresholds(70, 85, 100, 80)).toEqual([80]);
  });

  it("crossing both warn and 100 in one jump returns both", () => {
    expect(evaluateThresholds(50, 105, 100, 80)).toEqual([80, 100]);
  });

  it("no re-fire when already past the mark", () => {
    expect(evaluateThresholds(85, 95, 100, 80)).toEqual([]);
  });

  it("crossing 100 alone returns [100]", () => {
    expect(evaluateThresholds(90, 130, 100, 80)).toEqual([100]);
  });
});

describe("repo mappers — pure", () => {
  it("mapClientUsageRow coerces bigint strings and converts nano → USD", () => {
    const row: ClientUsageQueryRow = {
      client_id: "acme",
      requests: "42",
      llm_cost_nano: "3900000", // $0.0039
      embed_cost_nano: "160000", // $0.00016
      month_cost_nano: "4060000",
      last_activity_at: "2026-07-23T10:00:00.000Z",
    };
    const r = mapClientUsageRow(row);
    expect(r.clientId).toBe("acme");
    expect(r.requests).toBe(42);
    expect(r.llmCostUsd).toBeCloseTo(0.0039, 9);
    expect(r.embedCostUsd).toBeCloseTo(0.00016, 9);
    expect(r.monthCostUsd).toBeCloseTo(0.00406, 9);
    expect(r.lastActivityAt).toBe("2026-07-23T10:00:00.000Z");
  });

  it("mapClientUsageRow tolerates a null last activity", () => {
    const row: ClientUsageQueryRow = {
      client_id: "x",
      requests: 0,
      llm_cost_nano: 0,
      embed_cost_nano: 0,
      month_cost_nano: 0,
      last_activity_at: null,
    };
    expect(mapClientUsageRow(row).lastActivityAt).toBeNull();
  });

  it("mapDayUsageRow splits tokens and converts cost", () => {
    const row: DayUsageQueryRow = {
      date: "2026-07-23",
      input_tokens: "1500",
      output_tokens: "250",
      embed_tokens: "20",
      requests: "5",
      cost_nano: "375000",
    };
    const r = mapDayUsageRow(row);
    expect(r).toEqual({
      date: "2026-07-23",
      inputTokens: 1500,
      outputTokens: 250,
      embedTokens: 20,
      requests: 5,
      costUsd: 0.000375,
    });
  });

  it("mapConversationCostRow coerces and ISO-normalizes lastTs", () => {
    const row: ConversationCostQueryRow = {
      conversation_id: "conv-1",
      client_id: "acme",
      turns: "3",
      input_tokens: "900",
      output_tokens: "120",
      embed_tokens: "40",
      cost_nano: "250000",
      last_ts: new Date("2026-07-23T12:00:00.000Z"),
    };
    const r = mapConversationCostRow(row);
    expect(r.conversationId).toBe("conv-1");
    expect(r.turns).toBe(3);
    expect(r.costUsd).toBeCloseTo(0.00025, 9);
    expect(r.lastTs).toBe("2026-07-23T12:00:00.000Z");
  });

  it("mapBudgetRow coerces types and normalizes scope", () => {
    const row: BudgetQueryRow = {
      scope: "client",
      client_id: "acme",
      monthly_ceiling_nano_usd: "50000000000", // $50
      warn_pct: "90",
      soft_block: true,
    };
    expect(mapBudgetRow(row)).toEqual({
      scope: "client",
      clientId: "acme",
      monthlyCeilingNanoUsd: 50_000_000_000,
      warnPct: 90,
      softBlock: true,
    });
  });

  it("rollupDays folds nano cost + tokens across days", () => {
    const days: DayUsageQueryRow[] = [
      { date: "2026-07-22", input_tokens: "100", output_tokens: "10", embed_tokens: "5", requests: "2", cost_nano: "1000" },
      { date: "2026-07-23", input_tokens: "200", output_tokens: "20", embed_tokens: "5", requests: "3", cost_nano: "2000" },
    ];
    expect(rollupDays(days)).toEqual({
      inputTokens: 300,
      outputTokens: 30,
      embedTokens: 10,
      requests: 5,
      costNanoUsd: 3000,
    });
  });

  it("rollupDays of an empty range is all zeros", () => {
    expect(rollupDays([])).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      embedTokens: 0,
      requests: 0,
      costNanoUsd: 0,
    });
  });
});
