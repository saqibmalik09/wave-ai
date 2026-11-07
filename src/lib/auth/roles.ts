/**
 * Role model + server-side role guard.
 *
 * Roles are DATA, not a hardcoded UI branch: the database stores a `UserRole`
 * enum (USER / ADMIN / SUPERADMIN) and the app maps it to the broader session
 * `Role` (which also includes the session-only `guest`). This module is the one
 * place that translates between the two and that enforces "at least ADMIN".
 *
 * Server-only (the guard reads the session via the DAL, which uses
 * `next/headers`).
 */
import { getCurrentUser } from "./dal";
import type { Role, SessionUser } from "./types";
import type { UserRole } from "@prisma/client";

/** Ordered privilege ladder. Higher number = more privilege. */
const RANK: Record<Role, number> = {
  guest: 0,
  user: 1,
  admin: 2,
  superadmin: 3,
};

/** Admin-capable roles that an admin guard accepts. */
export type MinRole = "ADMIN" | "SUPERADMIN";

/** Maps a persisted Prisma `UserRole` to the app session `Role`. */
export function roleFromPrisma(role: UserRole): Role {
  switch (role) {
    case "SUPERADMIN":
      return "superadmin";
    case "ADMIN":
      return "admin";
    default:
      return "user";
  }
}

/** Maps an app session `Role` to a persisted Prisma `UserRole`. */
export function roleToPrisma(role: Role): UserRole {
  switch (role) {
    case "superadmin":
      return "SUPERADMIN";
    case "admin":
      return "ADMIN";
    default:
      return "USER";
  }
}

/** True when `role` meets or exceeds the required minimum. */
export function satisfiesRole(role: Role, min: MinRole): boolean {
  const need = min === "SUPERADMIN" ? RANK.superadmin : RANK.admin;
  return RANK[role] >= need;
}

export type RequireRoleResult =
  | { ok: true; user: SessionUser }
  | { ok: false; status: 401 | 403 };

/**
 * Authorises the current request against a minimum role. Returns the session
 * user when allowed; otherwise a status (401 = no session, 403 = insufficient
 * role) so the caller can respond consistently. Fails closed.
 */
export async function requireRole(min: MinRole): Promise<RequireRoleResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, status: 401 };
  if (!satisfiesRole(user.role, min)) return { ok: false, status: 403 };
  return { ok: true, user };
}
