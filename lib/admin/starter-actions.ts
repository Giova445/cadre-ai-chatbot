"use server";
// Server Actions for the maker starter-questions editor (Rollout § C). Same
// discipline as lib/admin/actions.ts: FILE-LEVEL "use server" (not inline) so
// the Client Components (StarterEditor / StarterRowItem) can import these — Next
// disallows importing inline "use server" functions into Client Components — and
// consequently this module may export ONLY async functions; the Zod schemas live
// in ./action-schemas.
//
// Security: Server Actions compile to PUBLIC RPC endpoints, so requireAdmin()
// runs FIRST, server-side, on every call (middleware is UX only, never a trust
// boundary — the CVE-2025-29927 lesson). Client input arrives as `unknown` and
// is Zod-parsed at the boundary before it reaches the DB. Input is never logged.

import { revalidatePath } from "next/cache";
import {
  createStarterSchema,
  updateStarterSchema,
  reorderStartersSchema,
  deleteStarterSchema,
} from "./action-schemas";
import { starterRepo } from "./starter-repo";
import { requireAdmin } from "./auth";

/** Append a new starter chip for a tenant. Auth-gated, validated, persisted. */
export async function createStarter(input: unknown): Promise<void> {
  await requireAdmin();
  const parsed = createStarterSchema.parse(input);
  await starterRepo.create({ clientId: parsed.clientId, text: parsed.text });
  revalidatePath("/admin/questions");
}

/** Edit a chip's text and/or enabled flag (omitted fields are left unchanged). */
export async function updateStarter(input: unknown): Promise<void> {
  await requireAdmin();
  const parsed = updateStarterSchema.parse(input);
  await starterRepo.update(parsed.id, { text: parsed.text, enabled: parsed.enabled });
  revalidatePath("/admin/questions");
}

/** Rewrite the display order for a tenant from a complete ordered id list. */
export async function reorderStarters(input: unknown): Promise<void> {
  await requireAdmin();
  const parsed = reorderStartersSchema.parse(input);
  await starterRepo.reorder(parsed.clientId, parsed.orderedIds);
  revalidatePath("/admin/questions");
}

/** Delete a single chip by id. */
export async function deleteStarter(input: unknown): Promise<void> {
  await requireAdmin();
  const parsed = deleteStarterSchema.parse(input);
  await starterRepo.delete(parsed.id);
  revalidatePath("/admin/questions");
}
