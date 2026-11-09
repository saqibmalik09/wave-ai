/**
 * Plan catalogue repository.
 *
 * Plans are DATA: the admin creates/edits rows here and the app never hardcodes
 * tiers. Listing is cursor-paginated (never OFFSET) and selects explicit
 * columns (never `SELECT *`). Server-only.
 */
import { prisma } from "@/lib/db/prisma";
import type { Prisma, PlanInterval } from "@prisma/client";

const planSelect = {
  id: true,
  code: true,
  name: true,
  priceCents: true,
  currency: true,
  interval: true,
  messageQuota: true,
  creditsPerPeriod: true,
  weeklyCredits: true,
  isPromo: true,
  features: true,
  active: true,
  createdAt: true,
} as const;

export type PlanDTO = Prisma.PlanGetPayload<{ select: typeof planSelect }>;

/** Max rows a single list page may return — bounds the query. */
const MAX_PAGE = 100;
const DEFAULT_PAGE = 50;

export type PlanPage = {
  items: PlanDTO[];
  /** Pass as `cursor` to fetch the next page; null when there are no more. */
  nextCursor: string | null;
};

/**
 * Cursor-paginated plan list, newest first. `cursor` is the id of the last item
 * from the previous page.
 */
export async function listPlans(options?: {
  cursor?: string | null;
  limit?: number;
  activeOnly?: boolean;
}): Promise<PlanPage> {
  const take = Math.min(Math.max(options?.limit ?? DEFAULT_PAGE, 1), MAX_PAGE);
  const rows = await prisma.plan.findMany({
    where: options?.activeOnly ? { active: true } : undefined,
    select: planSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1, // fetch one extra to know whether a next page exists
    ...(options?.cursor
      ? { cursor: { id: options.cursor }, skip: 1 }
      : {}),
  });

  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

export async function getPlanByCode(code: string): Promise<PlanDTO | null> {
  return prisma.plan.findUnique({
    where: { code: code.trim().toLowerCase() },
    select: planSelect,
  });
}

export async function getPlanById(id: string): Promise<PlanDTO | null> {
  return prisma.plan.findUnique({ where: { id }, select: planSelect });
}

export type CreatePlanInput = {
  code: string;
  name: string;
  priceCents?: number;
  currency?: string;
  interval?: PlanInterval;
  messageQuota?: number;
  /** Credits granted each period. 1 credit = $0.0001. */
  creditsPerPeriod?: number;
  /** Per-ISO-week credit ceiling; 0 = uncapped. */
  weeklyCredits?: number;
  isPromo?: boolean;
  features?: Prisma.InputJsonValue;
  active?: boolean;
};

export async function createPlan(input: CreatePlanInput): Promise<PlanDTO> {
  return prisma.plan.create({
    data: {
      code: input.code.trim().toLowerCase(),
      name: input.name.trim(),
      priceCents: input.priceCents ?? 0,
      currency: (input.currency ?? "usd").trim().toLowerCase(),
      interval: input.interval ?? "FREE",
      messageQuota: input.messageQuota ?? 0,
      creditsPerPeriod: input.creditsPerPeriod ?? 0,
      weeklyCredits: input.weeklyCredits ?? 0,
      isPromo: input.isPromo ?? false,
      features: input.features ?? {},
      active: input.active ?? true,
    },
    select: planSelect,
  });
}

export type UpdatePlanInput = {
  name?: string;
  priceCents?: number;
  currency?: string;
  interval?: PlanInterval;
  messageQuota?: number;
  creditsPerPeriod?: number;
  weeklyCredits?: number;
  isPromo?: boolean;
  features?: Prisma.InputJsonValue;
  active?: boolean;
};

export async function updatePlan(
  id: string,
  input: UpdatePlanInput
): Promise<PlanDTO> {
  return prisma.plan.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.priceCents !== undefined
        ? { priceCents: input.priceCents }
        : {}),
      ...(input.currency !== undefined
        ? { currency: input.currency.trim().toLowerCase() }
        : {}),
      ...(input.interval !== undefined ? { interval: input.interval } : {}),
      ...(input.messageQuota !== undefined
        ? { messageQuota: input.messageQuota }
        : {}),
      ...(input.creditsPerPeriod !== undefined
        ? { creditsPerPeriod: input.creditsPerPeriod }
        : {}),
      ...(input.weeklyCredits !== undefined
        ? { weeklyCredits: input.weeklyCredits }
        : {}),
      ...(input.isPromo !== undefined ? { isPromo: input.isPromo } : {}),
      ...(input.features !== undefined ? { features: input.features } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
    select: planSelect,
  });
}
