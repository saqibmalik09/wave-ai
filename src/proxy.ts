/**
 * Proxy (formerly Middleware in Next < 16). Optimistic auth redirects only —
 * it verifies the signed session token locally at the edge (no DB lookup) and
 * routes accordingly. The authoritative check still happens in the Data Access
 * Layer on the server.
 */
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth/config";
import { verifyToken } from "@/lib/auth/token";

const PROTECTED_PREFIXES = ["/dashboard"];
const AUTH_PAGES = ["/login", "/signup"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(AUTH_COOKIE)?.value;

  // Read the secret directly so a missing env fails safe (treated as no
  // session) instead of throwing for every request.
  const secret = process.env.AUTH_SECRET;
  const session = secret ? await verifyToken(token, secret) : null;

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  const isAuthPage = AUTH_PAGES.includes(pathname);

  if (isProtected && !session) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthPage && session) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/signup"],
};
