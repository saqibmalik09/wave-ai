import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";

/** Returns the current session user (or null). Used by client components. */
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ user });
}
