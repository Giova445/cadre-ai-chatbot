// Budget resolution + status. checkBudget is the ONLY synchronous, pre-response
// step the route may call; it is FAIL-OPEN — any error returns an unblocked
// status so a metering bug can never block a chat. The pure budgetStatus() and
// evaluateThresholds() carry all the arithmetic (unit-tested, no DB).

import { usageRepo } from "./repo";
import type { BudgetStatus } from "./types";

const NANO = 1e9;
const DEFAULT_WARN_PCT = 80;

/** Current calendar month as 'YYYY-MM' (UTC). */
export function currentYyyymm(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/**
 * Pure budget-status computation. ceiling 0 (or below) = unlimited → never blocks,
 * pct 0, status 'ok'. Otherwise pct = used/ceiling×100; status ok <warnPct,
 * warn >=warnPct, over >=100; blocked only when softBlock && >=100%.
 */
export function budgetStatus(
  usedNano: number,
  ceilingNano: number,
  warnPct: number,
  softBlock: boolean,
): BudgetStatus {
  if (ceilingNano <= 0) {
    return {
      blocked: false,
      usedNanoUsd: usedNano,
      ceilingNanoUsd: 0,
      pct: 0,
      status: "ok",
      softBlock,
    };
  }
  const pct = (usedNano / ceilingNano) * 100;
  const status: BudgetStatus["status"] = pct >= 100 ? "over" : pct >= warnPct ? "warn" : "ok";
  return {
    blocked: softBlock && pct >= 100,
    usedNanoUsd: usedNano,
    ceilingNanoUsd: ceilingNano,
    pct,
    status,
    softBlock,
  };
}

/**
 * Which alert thresholds were newly crossed moving from prevNano → newNano.
 * Pure; returns e.g. [80], [100], or [80, 100]. Empty when unlimited or no cross.
 */
export function evaluateThresholds(
  prevNano: number,
  newNano: number,
  ceilingNano: number,
  warnPct: number,
): number[] {
  if (ceilingNano <= 0) return [];
  const prevPct = (prevNano / ceilingNano) * 100;
  const newPct = (newNano / ceilingNano) * 100;
  return [warnPct, 100].filter((mark) => prevPct < mark && newPct >= mark);
}

// --- effective config resolution (client row → global row → env → default) ---
function envCeilingNano(): number {
  const usd = Number(process.env.USAGE_MONTHLY_CEILING_USD ?? "");
  return Number.isFinite(usd) && usd > 0 ? Math.round(usd * NANO) : 0;
}

function envSoftBlock(): boolean {
  return (process.env.USAGE_SOFT_BLOCK ?? "").trim().toLowerCase() === "true";
}

/**
 * Resolve the effective ceiling for a client, sum both the client's and the
 * global month spend, and return a client-oriented BudgetStatus whose `blocked`
 * additionally reflects the global ceiling. FAIL-OPEN on any error.
 */
export async function checkBudget(clientId: string): Promise<BudgetStatus> {
  try {
    const yyyymm = currentYyyymm();
    const [clientBudget, globalBudget, clientSpend, globalSpend] = await Promise.all([
      usageRepo.getBudget("client", clientId),
      usageRepo.getBudget("global", ""),
      usageRepo.monthSpendNano(clientId, yyyymm),
      usageRepo.monthSpendNano(null, yyyymm),
    ]);

    // Effective client ceiling: client row → global row → env → 0 (unlimited).
    const clientCeiling =
      clientBudget?.monthlyCeilingNanoUsd ||
      globalBudget?.monthlyCeilingNanoUsd ||
      envCeilingNano();
    // Global ceiling: global row → env → 0.
    const globalCeiling = globalBudget?.monthlyCeilingNanoUsd || envCeilingNano();

    const warnPct = clientBudget?.warnPct ?? globalBudget?.warnPct ?? DEFAULT_WARN_PCT;
    const softBlock = clientBudget?.softBlock ?? globalBudget?.softBlock ?? envSoftBlock();

    const base = budgetStatus(clientSpend, clientCeiling, warnPct, softBlock);
    const clientOver = clientCeiling > 0 && clientSpend >= clientCeiling;
    const globalOver = globalCeiling > 0 && globalSpend >= globalCeiling;

    return { ...base, blocked: softBlock && (clientOver || globalOver) };
  } catch (err) {
    // Fail-open: never block chat on a metering bug.
    console.error("[usage] checkBudget failed (fail-open):", err);
    return {
      blocked: false,
      usedNanoUsd: 0,
      ceilingNanoUsd: 0,
      pct: 0,
      status: "ok",
      softBlock: false,
    };
  }
}
