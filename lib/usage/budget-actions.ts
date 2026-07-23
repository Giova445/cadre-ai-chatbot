"use server";
// Server Action for the admin Usage & Cost budget editor. FILE-LEVEL "use
// server" (not inline) so the client-component BudgetEditor can import it —
// mirrors lib/admin/actions.ts. Consequently this module may export ONLY
// async functions; the Zod schema lives in lib/admin/action-schemas.ts.
//
// Security: requireAdmin() runs FIRST, server-side, on every call (Server
// Actions compile to public RPC endpoints — middleware is UX only, never a
// trust boundary). Input arrives as `unknown` and is Zod-parsed before it
// reaches usageRepo.setBudget. Budget config is server-only and must never be
// echoed back to a non-admin caller (see docs/product/usage-and-cost.md
// § Security & privacy of usage data).

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { setBudgetSchema } from "@/lib/admin/action-schemas";
import { usageRepo } from "@/lib/usage/repo";
import type { Budget } from "@/lib/usage/types";

const USD_TO_NANO = 1e9;

/**
 * Set (create or replace) a per-client or global monthly budget ceiling.
 * Auth-gated, Zod-validated, then persisted via usageRepo; revalidates the
 * usage panel so the new ceiling/status reflects on next render.
 */
export async function setBudgetAction(input: unknown): Promise<void> {
  await requireAdmin();
  const parsed = setBudgetSchema.parse(input);

  const budget: Budget = {
    scope: parsed.scope,
    clientId: parsed.scope === "client" ? parsed.clientId : "",
    monthlyCeilingNanoUsd: Math.round(parsed.monthlyCeilingUsd * USD_TO_NANO),
    warnPct: parsed.warnPct,
    softBlock: parsed.softBlock,
  };

  await usageRepo.setBudget(budget);
  revalidatePath("/admin/usage");
}
