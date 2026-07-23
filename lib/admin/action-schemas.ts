// Zod boundary schemas for the admin flagging Server Actions. Kept in their OWN
// module (not actions.ts) because a file-level "use server" module may export
// ONLY async functions — so the schema objects live here, where they stay
// ordinary, unit-testable exports importable from a plain Node/vitest env.

import { z } from "zod";
import {
  FLAG_CATEGORIES,
  FLAG_STATUSES,
  type FlagCategory,
  type FlagStatus,
} from "./contracts";

// `note` defaults to "" so an omitted note is valid; the 1000-char cap bounds the
// free-text field.
export const createFlagSchema = z.object({
  messageId: z.string().uuid(),
  category: z.enum(FLAG_CATEGORIES as [FlagCategory, ...FlagCategory[]]),
  note: z.string().max(1000).default(""),
});

export const updateFlagStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(FLAG_STATUSES as [FlagStatus, ...FlagStatus[]]),
});
