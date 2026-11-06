import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";

/** Clears the session cookie. */
export async function POST() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
