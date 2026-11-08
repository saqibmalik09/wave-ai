import { NextResponse, type NextRequest } from "next/server";
import { exchangeGoogleCode, getGoogleConfig } from "@/lib/auth/google";
import { upsertGoogleUser } from "@/lib/auth/store";
import { attachSession } from "@/lib/auth/session";
import type { SessionUser } from "@/lib/auth/types";

const STATE_COOKIE = "aw_oauth_state";

function appOrigin(): string {
  return (process.env.APP_URL || "http://localhost:3005").replace(/\/$/, "");
}

function redirectLogin(error: string): NextResponse {
  const res = NextResponse.redirect(
    `${appOrigin()}/login?error=${encodeURIComponent(error)}`
  );
  res.cookies.delete(STATE_COOKIE);
  return res;
}

/**
 * Google OAuth callback. Verifies CSRF state, exchanges the code, upserts the
 * user, sets the session cookie, and sends them to the dashboard.
 */
export async function GET(request: NextRequest) {
  const cfg = getGoogleConfig();
  if (!cfg) return redirectLogin("google_not_configured");

  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const savedState = request.cookies.get(STATE_COOKIE)?.value;

  if (oauthError) {
    return redirectLogin(
      oauthError === "access_denied" ? "google_denied" : "google_failed"
    );
  }
  if (!code || !state || !savedState || state !== savedState) {
    return redirectLogin("google_state");
  }

  const exchanged = await exchangeGoogleCode(cfg, code);
  if (!exchanged.ok) return redirectLogin("google_failed");

  if (!exchanged.profile.emailVerified) {
    return redirectLogin("google_email_unverified");
  }

  try {
    const user = await upsertGoogleUser({
      googleId: exchanged.profile.sub,
      email: exchanged.profile.email,
      name: exchanged.profile.name,
    });

    if (user.status === "SUSPENDED") {
      return redirectLogin("account_suspended");
    }

    const sessionUser: SessionUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
    const res = NextResponse.redirect(`${appOrigin()}/dashboard`);
    await attachSession(res, sessionUser);
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch {
    return redirectLogin("google_failed");
  }
}
