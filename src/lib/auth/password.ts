/**
 * Password hashing using Node's built-in scrypt (a strong, memory-hard KDF).
 *
 * We intentionally avoid pulling in an external hashing dependency: scrypt
 * ships with Node, is resistant to GPU brute force, and a few lines here do the
 * job. Server-only (uses `node:crypto`); never import from a Client Component.
 *
 * Stored format: `scrypt:<saltHex>:<hashHex>`.
 *
 * We use `:` (not `$`) as the delimiter on purpose: when the super-admin hash
 * lives in an env var, dotenv-expand would treat `$...` segments as variable
 * references and silently strip them. `:` is safe in env values. For backward
 * compatibility, verification still accepts the older `$`-delimited format.
 */
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LEN = 64;

/** Hashes a plaintext password for storage. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, KEY_LEN, PARAMS);
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}

/** Verifies a plaintext password against a stored `scrypt:...` (or legacy `$`) hash. */
export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  // Accept both the current `:` delimiter and the legacy `$` delimiter.
  const parts = stored.split(/[:$]/);
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  if (salt.length === 0 || expected.length === 0) return false;

  const derived = await scryptAsync(password, salt, expected.length, PARAMS);
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}
