import { NextResponse } from "next/server";
import { guardApi } from "@/lib/auth/api";
import { adjustCredits } from "@/lib/db/credits";
import { getUserById } from "@/lib/auth/store";

/**
 * Admin: manually correct a user's credit entitlement (support credit, comped
 * top-up, clawback). Writes an ADJUST ledger row so the balance stays
 * explainable, and moves `creditsGranted` rather than `creditsUsed` so the
 * user's real spend history is never rewritten.
 *
 * Authorisation uses the shared role guard (ADMIN or SUPERADMIN), so it fails
 * closed exactly like every other admin endpoint.
 *
 * Body: { userId, credits, note, idempotencyKey? }
 * `credits` is a non-zero integer: positive grants, negative takes back.
 * Passing `idempotencyKey` makes a retried request a no-op.
 */

/** Bounds a fat-fingered adjustment ($1,000 worth of credits). */
const MAX_ADJUSTMENT = 10_000_000;
const MAX_NOTE_LENGTH = 255;

export async function POST(request: Request) {
  const guard = await guardApi("ADMIN");
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const data = (body ?? {}) as Record<string, unknown>;

  const userId = String(data.userId ?? "").trim();
  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  const credits = Number(data.credits);
  if (!Number.isInteger(credits) || credits === 0) {
    return NextResponse.json(
      { error: "credits must be a non-zero integer." },
      { status: 400 }
    );
  }
  if (Math.abs(credits) > MAX_ADJUSTMENT) {
    return NextResponse.json(
      { error: `credits must be within +/-${MAX_ADJUSTMENT}.` },
      { status: 400 }
    );
  }

  const note = String(data.note ?? "").trim();
  if (!note) {
    return NextResponse.json(
      { error: "note is required (who approved this and why)." },
      { status: 400 }
    );
  }
  if (note.length > MAX_NOTE_LENGTH) {
    return NextResponse.json(
      { error: `note must be at most ${MAX_NOTE_LENGTH} characters.` },
      { status: 400 }
    );
  }

  const user = await getUserById(userId);
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const idempotencyKey =
    data.idempotencyKey !== undefined
      ? `adjust:${String(data.idempotencyKey).trim()}`
      : undefined;

  const result = await adjustCredits({ userId, credits, note, idempotencyKey });
  if (!result.ok) {
    return NextResponse.json(
      {
        error:
          result.reason === "no_active_plan"
            ? "That user has no active subscription to adjust."
            : "credits must be a non-zero integer.",
      },
      { status: result.reason === "no_active_plan" ? 409 : 400 }
    );
  }

  return NextResponse.json({
    ledgerId: result.ledgerId,
    replayed: result.replayed,
    wallet: result.wallet,
  });
}
