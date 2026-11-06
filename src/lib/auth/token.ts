/**
 * Stateless session tokens, signed with HMAC-SHA256 using the Web Crypto API.
 *
 * Web Crypto is available in both the Node.js and Edge runtimes, so the same
 * helper verifies a token locally in Proxy (edge), Route Handlers and the Data
 * Access Layer — no per-request database lookup to check a session.
 *
 * Format: `base64url(JSON payload) + "." + base64url(HMAC)`.
 */
import type { TokenPayload } from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/** Signs a payload and returns the compact token string. */
export async function signToken(
  payload: TokenPayload,
  secret: string
): Promise<string> {
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(body)
  );
  return `${body}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/**
 * Verifies a token's signature and expiry. Returns the payload when valid, or
 * `null` for any tampering, malformed input, or expiry. Never throws on bad
 * input.
 */
export async function verifyToken(
  token: string | undefined | null,
  secret: string
): Promise<TokenPayload | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const signaturePart = token.slice(dot + 1);

  try {
    const key = await importKey(secret);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlDecode(signaturePart),
      encoder.encode(body)
    );
    if (!valid) return null;

    const payload = JSON.parse(
      decoder.decode(base64UrlDecode(body))
    ) as TokenPayload;

    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
