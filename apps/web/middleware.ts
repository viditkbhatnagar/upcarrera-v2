import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Route protection for the staff console.
 *
 * - No `uc_token` cookie + visiting a protected page -> redirect to /login.
 * - Has `uc_token` cookie + visiting /login -> redirect to /dashboard.
 *
 * The (staff) route group is not part of the URL, so we match the real public paths
 * by allow-listing everything that does NOT require auth.
 */

const TOKEN_COOKIE = "uc_token";

// Paths reachable without a session.
const PUBLIC_PATHS = ["/login"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasToken = Boolean(request.cookies.get(TOKEN_COOKIE)?.value);

  // Logged-in users should never see the login page.
  if (hasToken && isPublic(pathname)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Unauthenticated users hitting a protected page get bounced to /login.
  if (!hasToken && !isPublic(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Run on everything except Next internals, static assets, and the favicon.
   * The "/" root falls through to middleware and is treated as protected.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
