/**
 * Session cookie management. Sets / clears the signed, HttpOnly session cookie.
 * Server-only (uses `next/headers`). Used by Route Handlers.
 */
import { cookies } from "next/headers";
import {
  AUTH_COOKIE,
  GUEST_TTL_SEC,
  SESSION_TTL_SEC,
  getAuthSecret,
} from "./config";
import { signToken } from "./token";
import type { SessionUser } from "./types";

/** Creates a session for the given user and writes the cookie. */
export async function createSession(
  user: SessionUser,
  options: { guest?: boolean } = {}
): Promise<void> {
  const guest = options.guest ?? false;
  const ttl = guest ? GUEST_TTL_SEC : SESSION_TTL_SEC;
  const now = Math.floor(Date.now() / 1000);

  const token = await signToken(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      guest,
      iat: now,
      exp: now + ttl,
    },
    getAuthSecret()
  );

  const store = await cookies();
  store.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ttl,
  });
}

/** Clears the session cookie (logout). */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(AUTH_COOKIE);
}
