/**
 * Data Access Layer for auth. Centralises reading + verifying the current
 * session so every surface checks it the same way. Server-only.
 *
 * `cache()` memoises within a single React render pass so multiple components
 * on one page don't each re-verify the token.
 *
 * This module imports `next/headers`, which makes it server-only by
 * construction — importing it from a Client Component is a build error.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { AUTH_COOKIE, getAuthSecret } from "./config";
import { verifyToken } from "./token";
import type { SessionUser } from "./types";

/**
 * Returns the current user (registered OR guest) from the signed cookie, or
 * `null` when there is no valid session. Reads `cookies()`, so callers must be
 * inside a dynamic/`<Suspense>` scope (Cache Components requirement).
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  const payload = await verifyToken(token, getAuthSecret());
  // Guest sessions are disabled — only registered accounts.
  if (!payload || payload.guest || payload.role === "guest") return null;
  return {
    id: payload.sub,
    email: payload.email,
    name: payload.name,
    role: payload.role,
  };
});
