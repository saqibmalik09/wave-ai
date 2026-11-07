/**
 * Helpers for role-gated API route handlers. Keeps every admin endpoint
 * responding to auth failures identically. Server-only.
 */
import { NextResponse } from "next/server";
import { requireRole, type MinRole } from "./roles";
import type { SessionUser } from "./types";

export type GuardResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

/**
 * Authorises an API request against a minimum role. On failure returns a ready
 * JSON response (401 when unauthenticated, 403 when under-privileged) so the
 * handler can early-return. Fails closed.
 */
export async function guardApi(min: MinRole): Promise<GuardResult> {
  const result = await requireRole(min);
  if (result.ok) return { ok: true, user: result.user };
  const message =
    result.status === 401 ? "Authentication required." : "Forbidden.";
  return {
    ok: false,
    response: NextResponse.json({ error: message }, { status: result.status }),
  };
}
