/**
 * Subscription repository.
 *
 * A user's current entitlement is the hot read (`getCurrentSubscription`),
 * served via the `(userId, status)` index and selecting explicit columns.
 * Granting a plan keeps exactly one ACTIVE subscription per user by cancelling
 * the previous one inside a transaction (idempotent-safe to re-run: re-granting
 * the same plan simply supersedes it). Server-only.
 *
 * NOTE: this is the data model + admin wiring only. There is NO payment
 * provider here — `grantSubscription` is an admin action (free / promo /
 * comped). The schema is ready for a billing integration later.
 */
import { prisma } from "@/lib/db/prisma";
import type { PlanInterval, Prisma } from "@prisma/client";

const currentSelect = {
  id: true,
  status: true,
  isFree: true,
  isPromo: true,
  startAt: true,
  endAt: true,
  creditsGranted: true,
  creditsUsed: true,
  plan: {
    select: {
      id: true,
      code: true,
      name: true,
      messageQuota: true,
      creditsPerPeriod: true,
      weeklyCredits: true,
      interval: true,
      isPromo: true,
      priceCents: true,
      currency: true,
    },
  },
} as const;

export type CurrentSubscription = Prisma.SubscriptionGetPayload<{
  select: typeof currentSelect;
}>;

/**
 * Returns the user's most recent ACTIVE subscription (with its plan), or null
 * when they have none. Treats an expired `endAt` as not-current.
 */
export async function getCurrentSubscription(
  userId: string
): Promise<CurrentSubscription | null> {
  const row = await prisma.subscription.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      OR: [{ endAt: null }, { endAt: { gt: new Date() } }],
    },
    select: currentSelect,
    orderBy: { createdAt: "desc" },
  });
  return row;
}

/**
 * Plan code every brand-new account starts on. Kept as data in the `plans`
 * table — this constant only names the row to look up, it does not define it.
 */
const DEFAULT_PLAN_CODE = "free";

/**
 * Puts a freshly created account on the default free plan so it has credits
 * immediately instead of having every generation refused until an admin grants
 * something.
 *
 * Deliberately best-effort and never throws: a missing/inactive `free` row, or
 * a race between two sign-in attempts for the same Google account, must not
 * turn a successful registration into a failed one. The caller treats this as
 * fire-and-forget.
 *
 * Idempotent: if the user already has an ACTIVE subscription (an admin grant,
 * or a second call), it is left exactly as it is.
 */
export async function ensureDefaultSubscription(
  userId: string
): Promise<void> {
  try {
    const existing = await prisma.subscription.findFirst({
      where: { userId, status: "ACTIVE" },
      select: { id: true },
    });
    if (existing) return;

    const plan = await prisma.plan.findUnique({
      where: { code: DEFAULT_PLAN_CODE },
      select: { id: true, active: true },
    });
    if (!plan || !plan.active) return;

    await grantSubscription({ userId, planId: plan.id });
  } catch {
    // Never block registration on entitlement setup.
  }
}

export type GrantSubscriptionInput = {
  userId: string;
  planId: string;
  /**
   * Explicit expiry. Omit it to derive the expiry from the plan's interval;
   * pass `null` to force "no expiry".
   */
  endAt?: Date | null;
  /** Overrides; default derived from the plan. */
  isFree?: boolean;
  isPromo?: boolean;
};

/**
 * Period end for a billing cadence, or null when the plan never expires.
 * Exported so an admin UI and a future billing webhook compute the same date.
 */
export function subscriptionEndAt(
  interval: PlanInterval,
  from: Date = new Date()
): Date | null {
  const shifted = new Date(from.getTime());
  switch (interval) {
    case "MONTH":
      shifted.setUTCMonth(shifted.getUTCMonth() + 1);
      return shifted;
    case "QUARTER":
      shifted.setUTCMonth(shifted.getUTCMonth() + 3);
      return shifted;
    case "YEAR":
      shifted.setUTCFullYear(shifted.getUTCFullYear() + 1);
      return shifted;
    // FREE and LIFETIME never expire.
    default:
      return null;
  }
}

/**
 * Grants (or changes) a user's subscription to a plan. Cancels any existing
 * ACTIVE subscriptions first so there is a single source of truth for the
 * user's current entitlement, then creates the new ACTIVE row — both in one
 * transaction.
 *
 * The plan's `creditsPerPeriod` is SNAPSHOT onto the subscription
 * (`creditsGranted`) and `creditsUsed` starts at 0: a later price change must
 * never retroactively shrink or inflate an entitlement someone already has.
 */
export async function grantSubscription(
  input: GrantSubscriptionInput
): Promise<CurrentSubscription> {
  const plan = await prisma.plan.findUnique({
    where: { id: input.planId },
    select: {
      id: true,
      interval: true,
      isPromo: true,
      priceCents: true,
      creditsPerPeriod: true,
    },
  });
  if (!plan) {
    throw new Error(`Plan not found: ${input.planId}`);
  }

  const isFree =
    input.isFree ?? (plan.interval === "FREE" || plan.priceCents === 0);
  const isPromo = input.isPromo ?? plan.isPromo;
  const startAt = new Date();
  // `undefined` = "derive it"; an explicit null stays null (no expiry).
  const endAt =
    input.endAt !== undefined
      ? input.endAt
      : subscriptionEndAt(plan.interval, startAt);

  const [, created] = await prisma.$transaction([
    prisma.subscription.updateMany({
      where: { userId: input.userId, status: "ACTIVE" },
      data: { status: "CANCELED" },
    }),
    prisma.subscription.create({
      data: {
        userId: input.userId,
        planId: plan.id,
        status: "ACTIVE",
        isFree,
        isPromo,
        startAt,
        endAt,
        creditsGranted: plan.creditsPerPeriod,
        creditsUsed: 0,
      },
      select: currentSelect,
    }),
  ]);

  return created;
}
