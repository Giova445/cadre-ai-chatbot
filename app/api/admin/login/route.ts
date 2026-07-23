// Admin login/logout. POST verifies ADMIN_PASSWORD and sets the signed session
// cookie; DELETE clears it. Node runtime (uses next/headers cookies()). The
// password is validated but NEVER logged, and a wrong password returns a bare
// 401 with no detail. This endpoint only mints the cookie — access to admin
// pages is still gated server-side by requireAdmin() in each route/RSC.

import { z } from "zod";
import { cookies } from "next/headers";
import { ADMIN_COOKIE } from "@/lib/admin/contracts";
import { verifyPassword, createSessionToken, ADMIN_COOKIE_MAX_AGE } from "@/lib/admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LoginSchema = z.object({ password: z.string().min(1).max(1024) });

// httpOnly (JS can't read it), secure (https + localhost is a secure context so
// dev still works), lax (survives top-level nav, not cross-site), path "/" so
// the cookie rides all admin routes.
const BASE_COOKIE = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
} as const;

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  const parsed = LoginSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ ok: false }, { status: 400 });
  }

  if (!verifyPassword(parsed.data.password)) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const token = await createSessionToken();
  const store = await cookies();
  store.set(ADMIN_COOKIE, token, { ...BASE_COOKIE, maxAge: ADMIN_COOKIE_MAX_AGE });

  return Response.json({ ok: true });
}

export async function DELETE() {
  const store = await cookies();
  store.set(ADMIN_COOKIE, "", { ...BASE_COOKIE, maxAge: 0 });
  return Response.json({ ok: true });
}
