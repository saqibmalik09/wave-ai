/**
 * Shared auth types. Safe to import from both server and client code
 * (contains only type declarations — no secrets, no Node APIs).
 */
export type Role = "superadmin" | "admin" | "user" | "guest";

/** Minimal user shape exposed to the UI (a DTO — never the stored record). */
export type SessionUser = {
  id: string;
  /** Null for anonymous guest sessions. */
  email: string | null;
  name: string;
  role: Role;
};

/** Signed, stateless session payload stored in the cookie. */
export type TokenPayload = {
  sub: string;
  email: string | null;
  name: string;
  role: Role;
  guest: boolean;
  /** Issued-at, seconds since epoch. */
  iat: number;
  /** Expiry, seconds since epoch. */
  exp: number;
};
