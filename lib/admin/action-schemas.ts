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

// ---------------------------------------------------------------------------
// Rollout § C — maker starter questions (starter-actions.ts). Bounds mirror
// lib/starters.ts (MAX_STARTER_LEN = 120); `clientId` matches the widget's
// bounded `client` field (z.string().max(64)). `.trim()` collapses leading/
// trailing whitespace BEFORE the min/max check so a whitespace-only label is
// rejected (min(1)) rather than stored blank.
// ---------------------------------------------------------------------------
export const createStarterSchema = z.object({
  clientId: z.string().min(1).max(64).default("default"),
  text: z.string().trim().min(1).max(120),
});

export const updateStarterSchema = z.object({
  id: z.string().uuid(),
  text: z.string().trim().min(1).max(120).optional(),
  enabled: z.boolean().optional(),
});

export const reorderStartersSchema = z.object({
  clientId: z.string().min(1).max(64).default("default"),
  orderedIds: z.array(z.string().uuid()).max(50),
});

// deleteStarter needs the same untrusted-id validation as the others; kept here
// with its siblings (a "use server" module may export only async functions, so
// the schema can't live in starter-actions.ts).
export const deleteStarterSchema = z.object({
  id: z.string().uuid(),
});
