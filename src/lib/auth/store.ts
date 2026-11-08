/**
 * User store — the auth data-access layer.
 *
 * This used to be a file-backed JSON store; it is now backed by Postgres via
 * Prisma. The PUBLIC SURFACE is unchanged on purpose — `findUserByEmail`,
 * `getUserById` and `createUser` keep the exact same signatures and return
 * shapes, so every existing caller (login/signup routes, session creation)
 * works without edits. New capabilities (phone update, status lookups) are
 * ADDED alongside rather than changing the existing functions.
 *
 * Server-only (uses the Prisma client / query engine). Never import from a
 * Client Component.
 */
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "./password";
import { superAdmin } from "./config";
import { roleFromPrisma } from "./roles";
import type { Role } from "./types";

/**
 * The stored user DTO. The original three fields (id/email/name/passwordHash/
 * role/createdAt) are preserved exactly — `createdAt` stays an ISO string so
 * callers that serialised it keep working. Phone/status are additive.
 */
export type StoredUser = {
  id: string;
  email: string; // always lower-cased
  name: string;
  /** Null for Google-only accounts. */
  passwordHash: string | null;
  googleId: string | null;
  role: Role;
  createdAt: string;
  phone: string | null;
  phoneVerified: boolean;
  status: "ACTIVE" | "SUSPENDED";
};

/**
 * Columns we ever read for a user. Explicit select — never `SELECT *` — so the
 * query stays cheap and stable as the table grows.
 */
const userSelect = {
  id: true,
  email: true,
  name: true,
  passwordHash: true,
  googleId: true,
  role: true,
  status: true,
  phone: true,
  phoneVerified: true,
  createdAt: true,
} as const;

type UserRow = {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
  googleId: string | null;
  role: import("@prisma/client").UserRole;
  status: "ACTIVE" | "SUSPENDED";
  phone: string | null;
  phoneVerified: boolean;
  createdAt: Date;
};

function toStoredUser(row: UserRow): StoredUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.passwordHash,
    googleId: row.googleId,
    role: roleFromPrisma(row.role),
    createdAt: row.createdAt.toISOString(),
    phone: row.phone,
    phoneVerified: row.phoneVerified,
    status: row.status,
  };
}

/** Seeds the super-admin from env once per process, idempotently. No-op when
 * env is unset. A single existence check + create on first auth call — never a
 * write on every request. */
let seeded = false;
async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  seeded = true;
  if (!superAdmin.email || !superAdmin.passwordHash) return;

  // Create only if absent. `createMany({ skipDuplicates })` keeps this safe
  // under a race between two cold processes (unique email).
  await prisma.user.createMany({
    data: [
      {
        email: superAdmin.email,
        name: superAdmin.name,
        passwordHash: superAdmin.passwordHash,
        role: "SUPERADMIN",
      },
    ],
    skipDuplicates: true,
  });
}

export async function findUserByEmail(
  email: string
): Promise<StoredUser | null> {
  await ensureSeeded();
  const normalized = email.trim().toLowerCase();
  const row = await prisma.user.findUnique({
    where: { email: normalized },
    select: userSelect,
  });
  return row ? toStoredUser(row) : null;
}

export async function getUserById(id: string): Promise<StoredUser | null> {
  await ensureSeeded();
  const row = await prisma.user.findUnique({
    where: { id },
    select: userSelect,
  });
  return row ? toStoredUser(row) : null;
}

export type CreateUserResult =
  | { ok: true; user: StoredUser }
  | { ok: false; reason: "duplicate" };

/** Creates a registered user, hashing the password. Fails on duplicate email. */
export async function createUser(input: {
  email: string;
  name: string;
  password: string;
}): Promise<CreateUserResult> {
  await ensureSeeded();
  const email = input.email.trim().toLowerCase();

  // Cheap existence check first; the unique constraint is the real guard and
  // the catch below handles the race between check and insert.
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) return { ok: false, reason: "duplicate" };

  const passwordHash = await hashPassword(input.password);

  try {
    const row = await prisma.user.create({
      data: {
        email,
        name: input.name.trim(),
        passwordHash,
        role: "USER",
      },
      select: userSelect,
    });
    return { ok: true, user: toStoredUser(row) };
  } catch (err) {
    // P2002 = unique constraint violation (another request won the race).
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      return { ok: false, reason: "duplicate" };
    }
    throw err;
  }
}

/**
 * Find-or-create a user from a verified Google profile.
 * - Match by googleId first, then by email.
 * - Links googleId onto an existing email/password account without wiping the password.
 * - Creates a Google-only account (passwordHash null) when new.
 */
export async function upsertGoogleUser(input: {
  googleId: string;
  email: string;
  name: string;
}): Promise<StoredUser> {
  await ensureSeeded();
  const email = input.email.trim().toLowerCase();
  const googleId = input.googleId.trim();
  const name = input.name.trim() || email.split("@")[0] || "User";

  const byGoogle = await prisma.user.findUnique({
    where: { googleId },
    select: userSelect,
  });
  if (byGoogle) {
    if (byGoogle.name !== name) {
      const updated = await prisma.user.update({
        where: { id: byGoogle.id },
        data: { name },
        select: userSelect,
      });
      return toStoredUser(updated);
    }
    return toStoredUser(byGoogle);
  }

  const byEmail = await prisma.user.findUnique({
    where: { email },
    select: userSelect,
  });
  if (byEmail) {
    const updated = await prisma.user.update({
      where: { id: byEmail.id },
      data: {
        googleId,
        // Keep existing name if set; fill only when blank-ish.
        name: byEmail.name?.trim() ? byEmail.name : name,
      },
      select: userSelect,
    });
    return toStoredUser(updated);
  }

  const created = await prisma.user.create({
    data: {
      email,
      name,
      googleId,
      passwordHash: null,
      role: "USER",
    },
    select: userSelect,
  });
  return toStoredUser(created);
}

export type UpdatePhoneResult =
  | { ok: true; user: StoredUser }
  | { ok: false; reason: "not_found" };

/**
 * Updates a user's phone number. Setting a new number resets `phoneVerified`
 * to false (the schema is OTP-ready even though no SMS/OTP is wired yet).
 * Pass `null` to clear the number.
 */
export async function updateUserPhone(
  userId: string,
  phone: string | null
): Promise<UpdatePhoneResult> {
  try {
    const row = await prisma.user.update({
      where: { id: userId },
      data: { phone, phoneVerified: false },
      select: userSelect,
    });
    return { ok: true, user: toStoredUser(row) };
  } catch (err) {
    // P2025 = record to update not found.
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "P2025"
    ) {
      return { ok: false, reason: "not_found" };
    }
    throw err;
  }
}
