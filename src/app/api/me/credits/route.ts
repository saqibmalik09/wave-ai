import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { emptyWallet, getWallet } from "@/lib/db/credits";

/**
 * The signed-in user's credit wallet: what the plan granted, what has been
 * spent (settled spend plus still-reserved holds) and where the weekly cap
 * stands. Returns the shared `WalletDTO` so every surface renders the same
 * numbers the generate route enforces.
 *
 * A user with no active subscription gets a zeroed wallet rather than an error:
 * the shape never changes, and every spend still refuses server-side.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }
  if (user.role === "guest" || user.email === null) {
    // Guests have no DB row, so no entitlement to read.
    return NextResponse.json(emptyWallet());
  }

  const wallet = await getWallet(user.id);
  // Balances change on every generation — never let a cache serve them.
  return NextResponse.json(wallet ?? emptyWallet(), {
    headers: { "cache-control": "no-store" },
  });
}
