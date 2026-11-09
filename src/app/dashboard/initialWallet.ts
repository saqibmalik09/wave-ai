/**
 * Server-side seed for the credits UI.
 *
 * Reads the same `GET /api/me/credits` the browser uses, forwarding the
 * session cookie, so the sidebar and the Imagine cost line paint with a real
 * balance instead of a skeleton. Every failure (endpoint not deployed, slow
 * upstream, no session) resolves to null and the client re-reads on mount —
 * the page never blocks on it for more than the timeout below.
 *
 * Server-only: uses `next/headers`.
 */
import { headers } from "next/headers";
import type { WalletDTO } from "@/lib/ai/types";

const SEED_TIMEOUT_MS = 1200;

export async function getInitialWallet(): Promise<WalletDTO | null> {
  try {
    const incoming = await headers();
    const host = incoming.get("x-forwarded-host") ?? incoming.get("host");
    if (!host) return null;

    const proto =
      incoming.get("x-forwarded-proto") ??
      (host.startsWith("localhost") || host.startsWith("127.0.0.1")
        ? "http"
        : "https");

    const res = await fetch(`${proto}://${host}/api/me/credits`, {
      headers: { cookie: incoming.get("cookie") ?? "" },
      cache: "no-store",
      signal: AbortSignal.timeout(SEED_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as WalletDTO;
  } catch {
    return null;
  }
}
