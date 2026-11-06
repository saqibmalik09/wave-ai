/**
 * Auth configuration. All secrets come from the environment — nothing
 * sensitive is hardcoded here. In production these env values are expected to
 * be sourced from the encrypted IntegrationConfig/secret store and injected at
 * runtime; locally they live in `.env.local` (which is git-ignored).
 */

/** Session cookie name. */
export const AUTH_COOKIE = "aw_session";

/** Session lifetime for registered users (7 days). */
export const SESSION_TTL_SEC = 60 * 60 * 24 * 7;

/** Session lifetime for anonymous guests (24 hours). */
export const GUEST_TTL_SEC = 60 * 60 * 24;

/**
 * Returns the HMAC signing secret, throwing if it is missing so that we fail
 * closed (never sign or trust a token without a configured secret).
 */
export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET is not configured. Set it in .env.local (see .env.example)."
    );
  }
  return secret;
}

/**
 * Optional seeded super-admin, read from the environment. The password is
 * stored pre-hashed (never in plaintext, never committed). When unset, no
 * super-admin is seeded.
 */
export const superAdmin = {
  email: process.env.SUPERADMIN_EMAIL?.trim().toLowerCase() || null,
  name: process.env.SUPERADMIN_NAME?.trim() || "Admin",
  passwordHash: process.env.SUPERADMIN_PASSWORD_HASH?.trim() || null,
} as const;
