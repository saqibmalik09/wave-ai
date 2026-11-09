/**
 * Credits repository — the only place credit balances are allowed to move.
 *
 * The money path is reserve → work → settle, never "work then charge": credits
 * are held BEFORE a provider is called, so a crash, a timeout or a disconnected
 * client can overspend by at most the amount already held, and a sweeper can
 * find the orphan on the `[status, createdAt]` index.
 *
 * Three invariants this module enforces:
 *
 *  - **Idempotent.** Every mutation is keyed by `idempotencyKey`, unique in the
 *    database. A retried request (same key) returns the existing ledger row; it
 *    never reserves, settles or refunds twice. The unique index is the
 *    enforcement — the read before it is only a fast path.
 *  - **Fail closed.** No active subscription, a non-positive amount, a lost
 *    race on the counter update, or any doubt at all refuses the spend. Every
 *    quota check is an atomic compare-and-set (`updateMany` with the bound in
 *    the `WHERE`), not a read followed by a hopeful write.
 *  - **Atomic.** Reserve, settle and refund each move the ledger row and both
 *    counters inside one transaction, in a fixed order (subscription, then the
 *    week row) so concurrent spends cannot deadlock against each other.
 *
 * Reads select explicit columns (never `SELECT *`). Server-only.
 */
import { prisma } from "@/lib/db/prisma";
import { ticksToCredits, type GenerationRefusal, type WalletDTO } from "@/lib/ai/types";
import type { LedgerKind, LedgerStatus, Prisma } from "@prisma/client";

/** Interactive-transaction budget. Bounded so a stuck lock cannot pile up. */
const TX_TIMEOUT_MS = 10_000;

/** Operator notes and machine failure reasons share one bounded column. */
const MAX_NOTE_LENGTH = 255;

/**
 * Monday 00:00 UTC of the ISO week containing `at`. The single source of the
 * week-boundary math: `weekly_usage.weekStart` rows, the wallet's `weekStart`
 * and every refund bucket are derived from this one function, so a settle that
 * lands after midnight on Sunday still credits the week it was reserved in.
 */
export function isoWeekStart(at: Date = new Date()): Date {
  // getUTCDay(): 0 = Sunday … 6 = Saturday. Shift so Monday = 0.
  const offsetFromMonday = (at.getUTCDay() + 6) % 7;
  return new Date(
    Date.UTC(
      at.getUTCFullYear(),
      at.getUTCMonth(),
      at.getUTCDate() - offsetFromMonday
    )
  );
}

/** `YYYY-MM-DD` — the WalletDTO field and the DATE column literal. */
function weekStartIso(weekStart: Date): string {
  return weekStart.toISOString().slice(0, 10);
}

/**
 * Makes sure the user's row for this week exists, atomically.
 *
 * Prisma's `upsert` compiles to a SELECT followed by an INSERT on MySQL, so two
 * generations starting at the same moment in a user's first request of the week
 * would race and one would die on the unique index. `ON DUPLICATE KEY UPDATE`
 * is a single statement and cannot race. One round trip, no lock held open.
 */
async function ensureWeekRow(
  tx: Prisma.TransactionClient,
  userId: string,
  weekStart: Date
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO weekly_usage (id, userId, weekStart, creditsUsed)
    VALUES (${crypto.randomUUID()}, ${userId}, ${weekStartIso(weekStart)}, 0)
    ON DUPLICATE KEY UPDATE id = id`;
}

const walletSubscriptionSelect = {
  id: true,
  creditsGranted: true,
  creditsUsed: true,
  plan: { select: { name: true, weeklyCredits: true } },
} as const;

function buildWallet(params: {
  planName: string;
  granted: number;
  used: number;
  weeklyLimit: number;
  weeklyUsed: number;
  weekStart: Date;
}): WalletDTO {
  const remaining = Math.max(0, params.granted - params.used);
  const percentUsed =
    params.granted > 0
      ? Math.round((Math.min(params.used, params.granted) / params.granted) * 1000) / 10
      : 0;
  const weeklyRemaining =
    params.weeklyLimit > 0
      ? Math.max(0, params.weeklyLimit - params.weeklyUsed)
      : remaining;

  return {
    planName: params.planName,
    granted: params.granted,
    used: params.used,
    remaining,
    percentUsed,
    weeklyLimit: params.weeklyLimit,
    weeklyUsed: params.weeklyUsed,
    weeklyRemaining,
    weekStart: weekStartIso(params.weekStart),
  };
}

/**
 * A wallet for a user with no active subscription: everything zero, so a
 * surface can render without branching and every spend still refuses.
 */
export function emptyWallet(at: Date = new Date()): WalletDTO {
  return buildWallet({
    planName: "",
    granted: 0,
    used: 0,
    weeklyLimit: 0,
    weeklyUsed: 0,
    weekStart: isoWeekStart(at),
  });
}

/**
 * The wallet hot read: current entitlement + this week's counter. Two indexed
 * point reads issued in parallel, explicit columns only. Returns null when the
 * user has no active (non-expired) subscription.
 */
export async function getWallet(userId: string): Promise<WalletDTO | null> {
  const weekStart = isoWeekStart();

  const [subscription, week] = await Promise.all([
    prisma.subscription.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        OR: [{ endAt: null }, { endAt: { gt: new Date() } }],
      },
      select: walletSubscriptionSelect,
      orderBy: { createdAt: "desc" },
    }),
    prisma.weeklyUsage.findUnique({
      where: { userId_weekStart: { userId, weekStart } },
      select: { creditsUsed: true },
    }),
  ]);

  if (!subscription) return null;

  return buildWallet({
    planName: subscription.plan.name,
    granted: subscription.creditsGranted,
    used: subscription.creditsUsed,
    weeklyLimit: subscription.plan.weeklyCredits,
    weeklyUsed: week?.creditsUsed ?? 0,
    weekStart,
  });
}

/** Thrown inside a transaction to roll it back with a specific refusal. */
class RefusalError extends Error {
  readonly refusal: GenerationRefusal;

  constructor(refusal: GenerationRefusal) {
    super(refusal);
    this.name = "RefusalError";
    this.refusal = refusal;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

const ledgerSelect = {
  id: true,
  userId: true,
  subscriptionId: true,
  estimatedCredits: true,
  actualCredits: true,
  status: true,
  createdAt: true,
} as const;

type LedgerRow = Prisma.CreditLedgerGetPayload<{ select: typeof ledgerSelect }>;

export type ReserveInput = {
  userId: string;
  kind: LedgerKind;
  /** Caller-supplied, unique per logical attempt. Replays are no-ops. */
  idempotencyKey: string;
  /** Whole credits to hold. Must be > 0. */
  credits: number;
  /** The provider we intend to call first; recorded for reconciliation. */
  providerId?: string | null;
};

export type ReserveResult =
  | {
      ok: true;
      ledgerId: string;
      /** Credits held (the original hold on a replay). */
      credits: number;
      /** True when this key had already been reserved. */
      replayed: boolean;
      status: LedgerStatus;
    }
  | { ok: false; refusal: GenerationRefusal };

function replayOf(row: LedgerRow): ReserveResult {
  return {
    ok: true,
    ledgerId: row.id,
    credits: row.actualCredits ?? row.estimatedCredits,
    replayed: true,
    status: row.status,
  };
}

/**
 * Holds `credits` against the user's current subscription and writes a
 * RESERVED ledger row — all in one transaction, so either the hold and the row
 * both exist or neither does.
 *
 * Refuses (never throws) when there is no active plan, the period balance is
 * short, or the weekly cap is reached. Re-running with the same
 * `idempotencyKey` returns the original row without charging again.
 */
export async function reserve(input: ReserveInput): Promise<ReserveResult> {
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey) return { ok: false, refusal: "unsupported_request" };
  if (!Number.isInteger(input.credits) || input.credits <= 0) {
    return { ok: false, refusal: "unsupported_request" };
  }

  // Fast path for an obvious replay; the unique index below is what actually
  // guarantees it under concurrency.
  const known = await prisma.creditLedger.findUnique({
    where: { idempotencyKey },
    select: ledgerSelect,
  });
  if (known) return replayOf(known);

  const credits = input.credits;
  const weekStart = isoWeekStart();

  try {
    return await prisma.$transaction(
      async (tx) => {
        const subscription = await tx.subscription.findFirst({
          where: {
            userId: input.userId,
            status: "ACTIVE",
            OR: [{ endAt: null }, { endAt: { gt: new Date() } }],
          },
          select: {
            id: true,
            creditsGranted: true,
            creditsUsed: true,
            plan: { select: { weeklyCredits: true } },
          },
          orderBy: { createdAt: "desc" },
        });
        if (!subscription) throw new RefusalError("no_active_plan");
        if (subscription.creditsGranted <= 0) {
          throw new RefusalError("insufficient_credits");
        }
        if (subscription.creditsUsed + credits > subscription.creditsGranted) {
          throw new RefusalError("insufficient_credits");
        }

        const weeklyLimit = subscription.plan.weeklyCredits;
        if (weeklyLimit > 0 && credits > weeklyLimit) {
          throw new RefusalError("weekly_limit_reached");
        }

        // Ledger row first: a duplicate key aborts here, before any counter
        // moves, so a replay can never double-charge.
        const ledger = await tx.creditLedger.create({
          data: {
            userId: input.userId,
            subscriptionId: subscription.id,
            kind: input.kind,
            estimatedCredits: credits,
            status: "RESERVED",
            idempotencyKey,
            providerId: input.providerId ?? null,
          },
          select: { id: true, status: true },
        });

        // Atomic compare-and-set: the balance bound lives in the WHERE, so two
        // concurrent spends cannot both pass.
        const held = await tx.subscription.updateMany({
          where: {
            id: subscription.id,
            status: "ACTIVE",
            creditsUsed: { lte: subscription.creditsGranted - credits },
          },
          data: { creditsUsed: { increment: credits } },
        });
        if (held.count === 0) throw new RefusalError("insufficient_credits");

        await ensureWeekRow(tx, input.userId, weekStart);
        const weekHeld = await tx.weeklyUsage.updateMany({
          where: {
            userId: input.userId,
            weekStart,
            ...(weeklyLimit > 0
              ? { creditsUsed: { lte: weeklyLimit - credits } }
              : {}),
          },
          data: { creditsUsed: { increment: credits } },
        });
        if (weekHeld.count === 0) throw new RefusalError("weekly_limit_reached");

        return {
          ok: true as const,
          ledgerId: ledger.id,
          credits,
          replayed: false,
          status: ledger.status,
        };
      },
      { timeout: TX_TIMEOUT_MS }
    );
  } catch (err) {
    if (err instanceof RefusalError) {
      return { ok: false, refusal: err.refusal };
    }
    if (isUniqueViolation(err)) {
      // Another request won the race on this key. The transaction rolled back,
      // so no counter moved — return the winner's row.
      const row = await prisma.creditLedger.findUnique({
        where: { idempotencyKey },
        select: ledgerSelect,
      });
      if (row) return replayOf(row);
    }
    throw err;
  }
}

/**
 * Moves both counters by `delta` (negative = give back), clamped at zero so a
 * double refund can never mint credits. Reads inside the caller's transaction,
 * so the row is already locked.
 */
async function shiftCounters(
  tx: Prisma.TransactionClient,
  params: {
    userId: string;
    subscriptionId: string | null;
    weekStart: Date;
    delta: number;
  }
): Promise<void> {
  if (params.delta === 0) return;

  if (params.subscriptionId) {
    const subscription = await tx.subscription.findUnique({
      where: { id: params.subscriptionId },
      select: { creditsUsed: true },
    });
    if (subscription) {
      await tx.subscription.update({
        where: { id: params.subscriptionId },
        data: { creditsUsed: Math.max(0, subscription.creditsUsed + params.delta) },
      });
    }
  }

  const where = {
    userId_weekStart: { userId: params.userId, weekStart: params.weekStart },
  };
  await ensureWeekRow(tx, params.userId, params.weekStart);
  const week = await tx.weeklyUsage.findUnique({
    where,
    select: { creditsUsed: true },
  });
  if (week) {
    await tx.weeklyUsage.update({
      where,
      data: { creditsUsed: Math.max(0, week.creditsUsed + params.delta) },
    });
  }
}

export type SettleInput = {
  idempotencyKey: string;
  /**
   * Provider-reported cost in ticks (1 USD = 10^10). Null when the provider
   * does not report one — then the server-side estimate stands.
   */
  costTicks: bigint | null;
  providerId?: string | null;
  providerRequestId?: string | null;
};

export type SettleResult =
  | { ok: true; creditsCharged: number; replayed: boolean }
  | { ok: false; reason: "not_found" };

/**
 * Closes a reservation with the provider's own cost. The delta between
 * estimate and actual is applied to both counters, which means the difference
 * is refunded whenever the job came in cheaper than quoted.
 *
 * Idempotent: only a RESERVED row is claimed (`updateMany` on the status), so a
 * second settle reports the already-charged amount and moves nothing.
 */
export async function settle(input: SettleInput): Promise<SettleResult> {
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey) return { ok: false, reason: "not_found" };

  return prisma.$transaction(
    async (tx) => {
      const row = await tx.creditLedger.findUnique({
        where: { idempotencyKey },
        select: ledgerSelect,
      });
      if (!row) return { ok: false as const, reason: "not_found" as const };
      if (row.status !== "RESERVED") {
        return {
          ok: true as const,
          creditsCharged: row.actualCredits ?? row.estimatedCredits,
          replayed: true,
        };
      }

      const actual =
        input.costTicks === null
          ? row.estimatedCredits
          : ticksToCredits(input.costTicks);

      const claimed = await tx.creditLedger.updateMany({
        where: { id: row.id, status: "RESERVED" },
        data: {
          status: "SETTLED",
          actualCredits: actual,
          costTicks: input.costTicks,
          ...(input.providerId ? { providerId: input.providerId } : {}),
          ...(input.providerRequestId
            ? { providerRequestId: input.providerRequestId }
            : {}),
        },
      });
      if (claimed.count === 0) {
        // Lost the race to a concurrent settle/refund — report, change nothing.
        const fresh = await tx.creditLedger.findUnique({
          where: { id: row.id },
          select: { actualCredits: true, estimatedCredits: true },
        });
        return {
          ok: true as const,
          creditsCharged:
            fresh?.actualCredits ?? fresh?.estimatedCredits ?? row.estimatedCredits,
          replayed: true,
        };
      }

      await shiftCounters(tx, {
        userId: row.userId,
        subscriptionId: row.subscriptionId,
        // The week the hold was taken in, not "now": a job that finishes after
        // Sunday midnight must return credits to the week it borrowed from.
        weekStart: isoWeekStart(row.createdAt),
        delta: actual - row.estimatedCredits,
      });

      return { ok: true as const, creditsCharged: actual, replayed: false };
    },
    { timeout: TX_TIMEOUT_MS }
  );
}

export type RefundResult =
  | { ok: true; creditsReturned: number; replayed: boolean }
  | { ok: false; reason: "not_found" };

/**
 * Gives back a reservation in full and marks the row FAILED — used when the
 * provider never produced an asset (and therefore charged us nothing).
 *
 * `reason` is one of our own short machine strings; it never carries vendor
 * text, a prompt or anything user-supplied.
 */
export async function refundReservation(input: {
  idempotencyKey: string;
  reason: string;
}): Promise<RefundResult> {
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey) return { ok: false, reason: "not_found" };

  return prisma.$transaction(
    async (tx) => {
      const row = await tx.creditLedger.findUnique({
        where: { idempotencyKey },
        select: ledgerSelect,
      });
      if (!row) return { ok: false as const, reason: "not_found" as const };
      if (row.status !== "RESERVED") {
        return { ok: true as const, creditsReturned: 0, replayed: true };
      }

      const claimed = await tx.creditLedger.updateMany({
        where: { id: row.id, status: "RESERVED" },
        data: {
          status: "FAILED",
          actualCredits: 0,
          costTicks: null,
          note: input.reason.slice(0, MAX_NOTE_LENGTH),
        },
      });
      if (claimed.count === 0) {
        return { ok: true as const, creditsReturned: 0, replayed: true };
      }

      await shiftCounters(tx, {
        userId: row.userId,
        subscriptionId: row.subscriptionId,
        weekStart: isoWeekStart(row.createdAt),
        delta: -row.estimatedCredits,
      });

      return {
        ok: true as const,
        creditsReturned: row.estimatedCredits,
        replayed: false,
      };
    },
    { timeout: TX_TIMEOUT_MS }
  );
}

export type AdjustInput = {
  userId: string;
  /** Positive grants credits, negative takes them back. Never 0. */
  credits: number;
  /** Short operator note stored on the ledger row. */
  note: string;
  /** Optional, so an admin retry (double-click) cannot grant twice. */
  idempotencyKey?: string;
};

export type AdjustResult =
  | { ok: true; ledgerId: string; wallet: WalletDTO; replayed: boolean }
  | { ok: false; reason: "no_active_plan" | "invalid_amount" };

/**
 * Admin-only manual correction of a user's entitlement. Changes
 * `creditsGranted` (not `creditsUsed`) so the user's spend history stays
 * intact, and writes an ADJUST ledger row so the balance remains explainable.
 */
export async function adjustCredits(input: AdjustInput): Promise<AdjustResult> {
  if (!Number.isInteger(input.credits) || input.credits === 0) {
    return { ok: false, reason: "invalid_amount" };
  }
  const idempotencyKey = (input.idempotencyKey ?? crypto.randomUUID()).trim();

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.creditLedger.findUnique({
          where: { idempotencyKey },
          select: { id: true },
        });
        if (existing) {
          return { ledgerId: existing.id, replayed: true as const };
        }

        const subscription = await tx.subscription.findFirst({
          where: {
            userId: input.userId,
            status: "ACTIVE",
            OR: [{ endAt: null }, { endAt: { gt: new Date() } }],
          },
          select: { id: true, creditsGranted: true },
          orderBy: { createdAt: "desc" },
        });
        if (!subscription) throw new RefusalError("no_active_plan");

        const ledger = await tx.creditLedger.create({
          data: {
            userId: input.userId,
            subscriptionId: subscription.id,
            kind: "ADJUST",
            estimatedCredits: input.credits,
            actualCredits: input.credits,
            status: "SETTLED",
            idempotencyKey,
            note: input.note.slice(0, MAX_NOTE_LENGTH),
          },
          select: { id: true },
        });

        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            creditsGranted: Math.max(
              0,
              subscription.creditsGranted + input.credits
            ),
          },
        });

        return { ledgerId: ledger.id, replayed: false as const };
      },
      { timeout: TX_TIMEOUT_MS }
    );

    const wallet = (await getWallet(input.userId)) ?? emptyWallet();
    return {
      ok: true,
      ledgerId: result.ledgerId,
      wallet,
      replayed: result.replayed,
    };
  } catch (err) {
    if (err instanceof RefusalError) {
      return { ok: false, reason: "no_active_plan" };
    }
    if (isUniqueViolation(err)) {
      const row = await prisma.creditLedger.findUnique({
        where: { idempotencyKey },
        select: { id: true },
      });
      if (row) {
        const wallet = (await getWallet(input.userId)) ?? emptyWallet();
        return { ok: true, ledgerId: row.id, wallet, replayed: true };
      }
    }
    throw err;
  }
}
