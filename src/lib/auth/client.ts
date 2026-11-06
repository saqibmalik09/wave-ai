/**
 * Thin client-side wrappers around the auth Route Handlers. Returns a plain
 * result object so forms can render inline error states. No secrets here —
 * the server sets the HttpOnly session cookie; the client never sees the token.
 */
import type { SessionUser } from "./types";

export type AuthResult =
  | { ok: true; user: SessionUser }
  | { ok: false; error: string };

async function postJson(url: string, body?: unknown): Promise<AuthResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => null)) as
      | { user?: SessionUser; error?: string }
      | null;

    if (!res.ok || !data?.user) {
      return {
        ok: false,
        error: data?.error ?? "Something went wrong. Please try again.",
      };
    }
    return { ok: true, user: data.user };
  } catch {
    return {
      ok: false,
      error: "Network error. Check your connection and try again.",
    };
  }
}

export function loginRequest(email: string, password: string) {
  return postJson("/api/auth/login", { email, password });
}

export function signupRequest(name: string, email: string, password: string) {
  return postJson("/api/auth/signup", { name, email, password });
}

export function guestRequest() {
  return postJson("/api/auth/guest");
}

/** Safe-destination helper: only allow same-origin relative paths. */
export function safeNext(next: string | null | undefined): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/dashboard";
}
