/**
 * Session cookie management. Sets / clears the signed, HttpOnly session cookie.
 * Server-only (uses `next/headers`). Used by Route Handlers.
 */
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  GUEST_TTL_SEC,
  SESSION_TTL_SEC,
  getAuthSecret,
} from "./config";
import { signToken } from "./token";
import type { SessionUser } from "./types";

type SessionOptions = { guest?: boolean };

async function buildSessionCookie(
  user: SessionUser,
  options: SessionOptions = {}
): Promise<{ token: string; ttl: number }> {
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
  return { token, ttl };
}

function cookieOptions(ttl: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: ttl,
  };
}

/** Creates a session for the given user and writes the cookie via next/headers. */
export async function createSession(
  user: SessionUser,
  options: SessionOptions = {}
): Promise<void> {
  const { token, ttl } = await buildSessionCookie(user, options);
  const store = await cookies();
  store.set(AUTH_COOKIE, token, cookieOptions(ttl));
}

/**
 * Same as createSession, but sets the cookie on an explicit NextResponse
 * (needed for OAuth redirect responses so the Set-Cookie survives the 302).
 */
export async function attachSession(
  response: NextResponse,
  user: SessionUser,
  options: SessionOptions = {}
): Promise<void> {
  const { token, ttl } = await buildSessionCookie(user, options);
  response.cookies.set(AUTH_COOKIE, token, cookieOptions(ttl));
}

/** Clears the session cookie (logout). */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(AUTH_COOKIE);
}
