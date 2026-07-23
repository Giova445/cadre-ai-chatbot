// Provider balance / spend-to-date. Provider is inferred from AI_CHAT_BASE_URL:
// containing 'openrouter' → OpenRouter (has a /credits endpoint), else OpenAI
// (no balance endpoint for API keys). spendToDateUsd is ALWAYS our own tracked
// spend (all-time), independent of the provider having a balance API. Best-effort:
// a failed provider call degrades to balanceAvailable=false rather than throwing.

import { nanoToUsd } from "./cost";
import { usageRepo } from "./repo";
import type { BalanceInfo } from "./types";

const OPENAI_NOTE =
  "OpenAI provides no balance endpoint for API keys (verified: /dashboard/billing/* " +
  "require a session key, /organization/costs requires an admin key with api.usage.read). " +
  "Spend is computed from tracked tokens.";

function providerFromBaseUrl(baseUrl: string | undefined): "openrouter" | "openai" {
  return (baseUrl ?? "").toLowerCase().includes("openrouter") ? "openrouter" : "openai";
}

type OpenRouterCredits = { data?: { total_credits?: number; total_usage?: number } };

async function fetchOpenRouterRemaining(baseUrl: string, key: string): Promise<number | null> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/credits`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as OpenRouterCredits;
  const total = Number(body.data?.total_credits ?? 0);
  const used = Number(body.data?.total_usage ?? 0);
  return total - used;
}

export async function getBalance(): Promise<BalanceInfo> {
  const baseUrl = process.env.AI_CHAT_BASE_URL;
  const provider = providerFromBaseUrl(baseUrl);

  // Spend-to-date is always our tracked spend, regardless of provider.
  let spendToDateUsd = 0;
  try {
    spendToDateUsd = nanoToUsd(await usageRepo.totalSpendNano());
  } catch (err) {
    console.error("[usage] getBalance: tracked-spend read failed:", err);
  }

  if (provider === "openrouter" && baseUrl) {
    const key = process.env.AI_CHAT_API_KEY;
    try {
      const remainingUsd = key ? await fetchOpenRouterRemaining(baseUrl, key) : null;
      return {
        provider,
        balanceAvailable: remainingUsd !== null,
        remainingUsd,
        spendToDateUsd,
        note:
          remainingUsd !== null
            ? "Remaining = total_credits − total_usage from OpenRouter /credits."
            : "OpenRouter /credits unavailable (missing key or error); showing tracked spend only.",
      };
    } catch (err) {
      console.error("[usage] getBalance: OpenRouter /credits failed:", err);
      return {
        provider,
        balanceAvailable: false,
        remainingUsd: null,
        spendToDateUsd,
        note: "OpenRouter /credits request failed; showing tracked spend only.",
      };
    }
  }

  return {
    provider: "openai",
    balanceAvailable: false,
    remainingUsd: null,
    spendToDateUsd,
    note: OPENAI_NOTE,
  };
}
