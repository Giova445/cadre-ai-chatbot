// UX only — the real gate is requireAdmin() in each route (CVE-2025-29927).
//
// This middleware just bounces obviously-unauthenticated visitors to the login
// page so they don't hit a dead dashboard. It ONLY checks cookie *presence*, not
// validity — a crafted request can skip Next.js middleware entirely (that was the
// CVE-2025-29927 class of bug), so it must never be the security boundary. Every
// admin route/RSC independently calls requireAdmin(), which verifies the signed
// cookie server-side. Removing this file would not weaken security.

import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin/contracts";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdminArea = pathname.startsWith("/admin");
  const isLogin = pathname === "/admin/login";

  if (isAdminArea && !isLogin && !req.cookies.has(ADMIN_COOKIE)) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
