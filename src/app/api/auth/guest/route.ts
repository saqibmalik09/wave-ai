import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth/session";
import type { SessionUser } from "@/lib/auth/types";

/**
 * Continue as guest. Issues an anonymous session so the visitor can reach the
 * dashboard without an account. Gated/paid features show upgrade prompts.
 */
export async function POST() {
  const guest: SessionUser = {
    id: `guest_${randomUUID()}`,
    email: null,
    name: "Guest",
    role: "guest",
  };
  await createSession(guest, { guest: true });
  return NextResponse.json({ user: guest });
}
