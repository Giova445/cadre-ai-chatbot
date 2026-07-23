"use server";
// Server Actions for the admin dashboard's bad-answer flagging (Phase 4).
// FILE-LEVEL "use server" (not inline) so the client components FlagForm /
// StatusControl can import these actions — Next.js disallows importing inline
// "use server" functions into Client Components. Consequently this module may
// export ONLY async functions; the Zod schemas live in ./action-schemas.
//
// Security: Server Actions compile to PUBLIC RPC endpoints, so requireAdmin()
// runs FIRST, server-side, on every call — middleware is UX only, never a trust
// boundary (the CVE-2025-29927 lesson, same as auth.ts). Client input arrives as
// `unknown` and is Zod-parsed at the boundary before it reaches the DB. Input is
// never logged.

import { revalidatePath } from "next/cache";
import { createFlagSchema, updateFlagStatusSchema } from "./action-schemas";
import { flagRepo } from "./flag-repo";
import { requireAdmin } from "./auth";

/**
 * File a bad-answer flag against an assistant message. Auth-gated, validated,
 * then persisted via the repo; revalidates the transcript so the new flag badge
 * shows on next render. Throws on a Zod failure — the calling form surfaces it.
 */
export async function createFlag(input: unknown): Promise<void> {
  await requireAdmin();
  const parsed = createFlagSchema.parse(input);
  await flagRepo.create(parsed);
  revalidatePath("/admin/conversations");
}

/**
 * Move a flag through the review queue (open → triaged → resolved / wontfix).
 * Auth-gated and validated; revalidates the queue view. Throws on a Zod failure.
 */
export async function updateFlagStatus(input: unknown): Promise<void> {
  await requireAdmin();
  const parsed = updateFlagStatusSchema.parse(input);
  await flagRepo.updateStatus(parsed.id, parsed.status);
  revalidatePath("/admin/queue");
}
