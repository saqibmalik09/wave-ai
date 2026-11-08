/**
 * Google OAuth 2.0 helpers. Secrets come from env — never hardcoded.
 * Server-only (uses Node crypto for state).
 */
import { createHash, randomBytes } from "node:crypto";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";

export type GoogleConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

/** Returns Google OAuth config or null when not configured. */
export function getGoogleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI?.trim() ||
    (process.env.APP_URL
      ? `${process.env.APP_URL.replace(/\/$/, "")}/api/auth/google/callback`
      : "");

  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

/** Opaque CSRF state for the OAuth round-trip. */
export function createOAuthState(): string {
  return randomBytes(24).toString("base64url");
}

export function buildGoogleAuthUrl(cfg: GoogleConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    include_granted_scopes: "true",
    prompt: "select_account",
    state,
  });
  return `${GOOGLE_AUTH}?${params.toString()}`;
}

export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
};

type TokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type UserInfoResponse = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  error?: string;
};

/** Exchange authorization code for an access token, then fetch the profile. */
export async function exchangeGoogleCode(
  cfg: GoogleConfig,
  code: string
): Promise<
  | { ok: true; profile: GoogleProfile }
  | { ok: false; error: string }
> {
  const body = new URLSearchParams({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code",
  });

  const tokenRes = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const tokenJson = (await tokenRes.json().catch(() => null)) as TokenResponse | null;
  if (!tokenRes.ok || !tokenJson?.access_token) {
    return {
      ok: false,
      error:
        tokenJson?.error_description ||
        tokenJson?.error ||
        "Google token exchange failed.",
    };
  }

  const infoRes = await fetch(GOOGLE_USERINFO, {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  const info = (await infoRes.json().catch(() => null)) as UserInfoResponse | null;
  if (!infoRes.ok || !info?.sub || !info.email) {
    return {
      ok: false,
      error: info?.error || "Could not read Google profile.",
    };
  }

  return {
    ok: true,
    profile: {
      sub: info.sub,
      email: info.email.trim().toLowerCase(),
      emailVerified: Boolean(info.email_verified),
      name: (info.name?.trim() || info.email.split("@")[0] || "User").slice(0, 80),
    },
  };
}

/** Stable fingerprint for logging without storing the code. */
export function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}
