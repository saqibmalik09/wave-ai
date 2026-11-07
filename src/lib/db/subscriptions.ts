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
import type { Prisma } from "@prisma/client";

const currentSelect = {
  id: true,
  status: true,
  isFree: true,
  isPromo: true,
  startAt: true,
  endAt: true,
  plan: {
    select: {
      id: true,
      code: true,
      name: true,
      messageQuota: true,
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

export type GrantSubscriptionInput = {
  userId: string;
  planId: string;
  /** Optional explicit expiry; omit for free/lifetime (no expiry). */
  endAt?: Date | null;
  /** Overrides; default derived from the plan. */
  isFree?: boolean;
  isPromo?: boolean;
};

/**
 * Grants (or changes) a user's subscription to a plan. Cancels any existing
 * ACTIVE subscriptions first so there is a single source of truth for the
 * user's current entitlement, then creates the new ACTIVE row — both in one
 * transaction.
 */
export async function grantSubscription(
  input: GrantSubscriptionInput
): Promise<CurrentSubscription> {
  const plan = await prisma.plan.findUnique({
    where: { id: input.planId },
    select: { id: true, interval: true, isPromo: true, priceCents: true },
  });
  if (!plan) {
    throw new Error(`Plan not found: ${input.planId}`);
  }

  const isFree =
    input.isFree ?? (plan.interval === "FREE" || plan.priceCents === 0);
  const isPromo = input.isPromo ?? plan.isPromo;

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
        endAt: input.endAt ?? null,
      },
      select: currentSelect,
    }),
  ]);

  return created;
}
