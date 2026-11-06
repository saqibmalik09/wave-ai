/**
 * User store.
 *
 * NOTE ON SCOPE: this repository is a front-end only Next.js app — there is no
 * database wired up (no `electronicwave` connection, no ORM). To make sign-up
 * and login genuinely work end to end, this provides a small file-backed store
 * at `.data/users.json` (git-ignored). The public surface below
 * (`findUserByEmail`, `createUser`, `getUserById`) is deliberately the same
 * shape a real data-access layer would expose, so swapping this for a Postgres
 * / Prisma repository later is a one-file change with no call-site edits.
 *
 * Server-only: uses `node:fs` and `node:crypto`. Never import from the client.
 */
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { hashPassword } from "./password";
import { superAdmin } from "./config";
import type { Role } from "./types";

export type StoredUser = {
  id: string;
  email: string; // always lower-cased
  name: string;
  passwordHash: string;
  role: Role;
  createdAt: string;
};

const DATA_DIR = path.join(process.cwd(), ".data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

/** Serialises writes within this process so concurrent requests don't clobber. */
let writeChain: Promise<unknown> = Promise.resolve();
let seeded = false;

async function readAll(): Promise<StoredUser[]> {
  try {
    const raw = await fs.readFile(USERS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredUser[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(users: StoredUser[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  // Keep the chain alive but swallow rejections so one failure doesn't poison it.
  writeChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

/**
 * Seeds the super-admin from env (pre-hashed password) once per process, if
 * configured and not already present. No-op when env is unset.
 */
async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  seeded = true;
  if (!superAdmin.email || !superAdmin.passwordHash) return;

  await runExclusive(async () => {
    const users = await readAll();
    if (users.some((u) => u.email === superAdmin.email)) return;
    users.push({
      id: randomUUID(),
      email: superAdmin.email!,
      name: superAdmin.name,
      passwordHash: superAdmin.passwordHash!,
      role: "superadmin",
      createdAt: new Date().toISOString(),
    });
    await writeAll(users);
  });
}

export async function findUserByEmail(
  email: string
): Promise<StoredUser | null> {
  await ensureSeeded();
  const normalized = email.trim().toLowerCase();
  const users = await readAll();
  return users.find((u) => u.email === normalized) ?? null;
}

export async function getUserById(id: string): Promise<StoredUser | null> {
  await ensureSeeded();
  const users = await readAll();
  return users.find((u) => u.id === id) ?? null;
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
  const passwordHash = await hashPassword(input.password);

  return runExclusive<CreateUserResult>(async () => {
    const users = await readAll();
    if (users.some((u) => u.email === email)) {
      return { ok: false, reason: "duplicate" };
    }
    const user: StoredUser = {
      id: randomUUID(),
      email,
      name: input.name.trim(),
      passwordHash,
      role: "user",
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    await writeAll(users);
    return { ok: true, user };
  });
}
