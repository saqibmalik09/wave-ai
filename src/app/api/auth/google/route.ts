import { NextResponse } from "next/server";
import {
  buildGoogleAuthUrl,
  createOAuthState,
  getGoogleConfig,
} from "@/lib/auth/google";

const STATE_COOKIE = "aw_oauth_state";
const STATE_TTL_SEC = 60 * 10; // 10 minutes

/**
 * Start Google OAuth. Redirects the browser to Google's consent screen.
 * Requires GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI (or APP_URL).
 */
export async function GET() {
  const cfg = getGoogleConfig();
  if (!cfg) {
    return NextResponse.redirect(
      new URL(
        "/login?error=google_not_configured",
        process.env.APP_URL || "http://localhost:3005"
      )
    );
  }

  const state = createOAuthState();
  const url = buildGoogleAuthUrl(cfg, state);
  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STATE_TTL_SEC,
  });
  return res;
}
