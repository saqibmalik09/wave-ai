import { NextResponse } from "next/server";

/**
 * Guest login is disabled — only registered (email/password or Google)
 * accounts can access the dashboard.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Guest login is disabled. Sign in with email or Google." },
    { status: 403 }
  );
}
