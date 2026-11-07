import { NextResponse } from "next/server";
import { guardApi } from "@/lib/auth/api";
import { grantSubscription } from "@/lib/db/subscriptions";
import { getPlanByCode, getPlanById } from "@/lib/db/plans";
import { getUserById } from "@/lib/auth/store";

/**
 * Admin: grant / change a user's subscription (free, promo, or comped).
 *
 * Body: { userId, planId? , planCode?, endAt?, isFree?, isPromo? }
 * Provide either planId or planCode. This is an admin action only — there is NO
 * payment flow here; the schema is ready for one later.
 */
export async function POST(request: Request) {
  const guard = await guardApi("ADMIN");
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const data = (body ?? {}) as {
    userId?: unknown;
    planId?: unknown;
    planCode?: unknown;
    endAt?: unknown;
    isFree?: unknown;
    isPromo?: unknown;
  };

  const userId = String(data.userId ?? "").trim();
  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  const user = await getUserById(userId);
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  // Resolve the plan by id or code.
  const plan = data.planId
    ? await getPlanById(String(data.planId).trim())
    : data.planCode
      ? await getPlanByCode(String(data.planCode).trim())
      : null;
  if (!plan) {
    return NextResponse.json(
      { error: "Provide a valid planId or planCode." },
      { status: 400 }
    );
  }

  let endAt: Date | null | undefined;
  if (data.endAt !== undefined && data.endAt !== null) {
    const parsed = new Date(String(data.endAt));
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: "endAt must be an ISO date." },
        { status: 400 }
      );
    }
    endAt = parsed;
  }

  const subscription = await grantSubscription({
    userId,
    planId: plan.id,
    endAt,
    isFree: data.isFree !== undefined ? Boolean(data.isFree) : undefined,
    isPromo: data.isPromo !== undefined ? Boolean(data.isPromo) : undefined,
  });

  return NextResponse.json({ subscription }, { status: 201 });
}
