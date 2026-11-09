/**
 * Capability URLs for uploaded reference images.
 *
 * A generation provider fetches the reference image itself, anonymously — it
 * has no session cookie — so the read URL cannot be behind the session guard.
 * Instead the URL *is* the capability: an unguessable key, an expiry, and an
 * HMAC-SHA256 signature over both. Nothing is readable without a URL we
 * issued, and nothing stays readable after it expires.
 *
 * The same signature is what makes `POST /api/ai/generate` safe: it accepts a
 * `referenceImageUrls` entry only when the signature verifies, so a caller can
 * never point the server (or a provider) at an arbitrary host. That check is
 * local arithmetic — no database lookup on the hot path.
 *
 * The per-user directory prefix is a keyed hash of the user id, not the id
 * itself: it keeps user ids out of URLs while still letting the generate route
 * prove "this upload belongs to the caller" without a query.
 *
 * Web Crypto is used so this works in the Node and Edge runtimes alike (same
 * reason as `src/lib/auth/token.ts`). Server-only: it reads `AUTH_SECRET`.
 */
import { getAuthSecret } from "@/lib/auth/config";
import { isValidObjectKey } from "./types";

/** Every issued URL starts with this path. */
export const UPLOAD_PATH_PREFIX = "/api/ai/uploads/";

/** Reference images are throwaway; two hours is plenty for one generation. */
const DEFAULT_TTL_MINUTES = 120;
const MIN_TTL_MINUTES = 5;
const MAX_TTL_MINUTES = 24 * 60;

const encoder = new TextEncoder();

/** How long a freshly issued URL stays valid. */
export function uploadTtlMs(): number {
  const raw = Number(process.env.UPLOAD_TTL_MINUTES);
  const minutes = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_MINUTES;
  const clamped = Math.min(Math.max(minutes, MIN_TTL_MINUTES), MAX_TTL_MINUTES);
  return clamped * 60_000;
}

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/.test(hex)) {
    return null;
  }
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    utf8(getAuthSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/** What the signature covers: the key and the expiry, nothing else. */
function signedPayload(key: string, expSeconds: number): Uint8Array<ArrayBuffer> {
  return utf8(`${key}.${expSeconds}`);
}

/**
 * `TextEncoder.encode` is typed as `Uint8Array<ArrayBufferLike>`, which Web
 * Crypto's `BufferSource` will not accept, so copy into a plain ArrayBuffer —
 * same approach as `src/lib/auth/token.ts`.
 */
function utf8(value: string): Uint8Array<ArrayBuffer> {
  const source = encoder.encode(value);
  const bytes = new Uint8Array(new ArrayBuffer(source.byteLength));
  bytes.set(source);
  return bytes;
}

/** Hex HMAC over `<key>.<exp>`. */
export async function signUploadKey(
  key: string,
  expSeconds: number
): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(),
    signedPayload(key, expSeconds)
  );
  return toHex(new Uint8Array(signature));
}

/**
 * Constant-time signature check plus the expiry. Returns a reason instead of
 * throwing so callers can answer 404 vs 410 without a try/catch.
 */
export async function verifyUploadKey(
  key: string,
  expParam: string | null,
  sigParam: string | null
): Promise<{ ok: true; expiresAtMs: number } | { ok: false; reason: "malformed" | "bad_signature" | "expired" }> {
  if (!expParam || !sigParam) return { ok: false, reason: "malformed" };
  if (!isValidObjectKey(key)) return { ok: false, reason: "malformed" };

  const expSeconds = Number(expParam);
  if (!Number.isSafeInteger(expSeconds) || expSeconds <= 0) {
    return { ok: false, reason: "malformed" };
  }
  const signature = fromHex(sigParam);
  if (!signature) return { ok: false, reason: "malformed" };

  let valid: boolean;
  try {
    valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(),
      signature,
      signedPayload(key, expSeconds)
    );
  } catch {
    // Missing AUTH_SECRET or a malformed key: fail closed.
    return { ok: false, reason: "bad_signature" };
  }
  if (!valid) return { ok: false, reason: "bad_signature" };

  const expiresAtMs = expSeconds * 1000;
  if (expiresAtMs <= Date.now()) return { ok: false, reason: "expired" };
  return { ok: true, expiresAtMs };
}

/** The 16-hex directory a user's objects live under. Keyed, so not reversible. */
export async function userKeyPrefix(userId: string): Promise<string> {
  const digest = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(),
    utf8(`upload-prefix:${userId}`)
  );
  return toHex(new Uint8Array(digest)).slice(0, 16);
}

/** Unguessable 32-hex object name. The client's filename is never used. */
export function randomObjectName(extension: "png" | "jpg" | "webp"): string {
  const bytes = new Uint8Array(new ArrayBuffer(16));
  crypto.getRandomValues(bytes);
  return `${toHex(bytes)}.${extension}`;
}

/** Absolute, signed, expiring URL for a stored object. */
export async function buildUploadUrl(
  origin: string,
  key: string,
  expiresAtMs: number
): Promise<string> {
  const expSeconds = Math.floor(expiresAtMs / 1000);
  const signature = await signUploadKey(key, expSeconds);
  return `${origin}${UPLOAD_PATH_PREFIX}${key}?exp=${expSeconds}&sig=${signature}`;
}

/**
 * Origins this deployment answers on, most trustworthy first: the configured
 * `APP_URL`, then the proxy's forwarded host, then the request URL's own
 * origin (which keeps `localhost:3005` working in dev).
 *
 * This is only used to confirm a caller-supplied reference URL points back at
 * US. The decisive check is always the signature — a spoofed Host header
 * cannot forge one.
 */
export function selfOrigins(request: Request): string[] {
  const origins: string[] = [];

  const configured = process.env.APP_URL?.trim();
  if (configured) {
    try {
      origins.push(new URL(configured).origin);
    } catch {
      // Misconfigured APP_URL must not break uploads.
    }
  }

  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) {
    const proto =
      request.headers.get("x-forwarded-proto") ??
      (host.startsWith("localhost") || host.startsWith("127.0.0.1")
        ? "http"
        : "https");
    try {
      origins.push(new URL(`${proto}://${host}`).origin);
    } catch {
      // Ignore an unparseable Host header.
    }
  }

  try {
    origins.push(new URL(request.url).origin);
  } catch {
    // request.url is always absolute in a route handler; belt and braces.
  }

  return [...new Set(origins)];
}

/** The origin a newly issued URL should use: `APP_URL` wins when it is set. */
export function issuingOrigin(request: Request): string {
  return selfOrigins(request)[0] ?? new URL(request.url).origin;
}

export type VerifiedReference =
  | { ok: true; key: string; expiresAtMs: number }
  | {
      ok: false;
      reason: "not_absolute" | "foreign_origin" | "malformed" | "bad_signature" | "expired";
    };

/**
 * Validates a `referenceImageUrls` entry that claims to be one of ours.
 *
 * Never fetches the URL — that would be an SSRF. It only parses, compares the
 * origin against this deployment's own, and verifies the HMAC. `ownerPrefix`
 * additionally pins the object to the calling user, so one account cannot
 * reference another's upload even if it somehow obtained the URL.
 */
export async function verifyReferenceUrl(
  raw: string,
  allowedOrigins: readonly string[],
  ownerPrefix: string
): Promise<VerifiedReference> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: "not_absolute" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, reason: "foreign_origin" };
  }
  if (!allowedOrigins.includes(parsed.origin)) {
    return { ok: false, reason: "foreign_origin" };
  }
  if (!parsed.pathname.startsWith(UPLOAD_PATH_PREFIX)) {
    return { ok: false, reason: "foreign_origin" };
  }

  const key = decodeURIComponent(
    parsed.pathname.slice(UPLOAD_PATH_PREFIX.length)
  );
  if (!isValidObjectKey(key)) return { ok: false, reason: "malformed" };
  if (!key.startsWith(`${ownerPrefix}/`)) {
    return { ok: false, reason: "bad_signature" };
  }

  const verified = await verifyUploadKey(
    key,
    parsed.searchParams.get("exp"),
    parsed.searchParams.get("sig")
  );
  if (!verified.ok) return { ok: false, reason: verified.reason };

  return { ok: true, key, expiresAtMs: verified.expiresAtMs };
}
