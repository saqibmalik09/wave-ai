import { NextResponse } from "next/server";
import { guardApi } from "@/lib/auth/api";
import { createPlan, listPlans } from "@/lib/db/plans";
import type { PlanInterval, Prisma } from "@prisma/client";

const INTERVALS: readonly PlanInterval[] = [
  "FREE",
  "MONTH",
  "YEAR",
  "LIFETIME",
];

function parseInterval(value: unknown): PlanInterval | undefined {
  if (typeof value !== "string") return undefined;
  const upper = value.toUpperCase() as PlanInterval;
  return INTERVALS.includes(upper) ? upper : undefined;
}

/** Admin: cursor-paginated plan list. `?cursor=<id>&limit=<n>&activeOnly=1`. */
export async function GET(request: Request) {
  const guard = await guardApi("ADMIN");
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;
  const activeOnly = url.searchParams.get("activeOnly") === "1";

  const page = await listPlans({
    cursor,
    limit: Number.isFinite(limit) ? limit : undefined,
    activeOnly,
  });
  return NextResponse.json(page);
}

/** Admin: create a plan. */
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
  const code = String(data.code ?? "").trim();
  const name = String(data.name ?? "").trim();

  if (!code || !/^[a-z0-9][a-z0-9_-]{0,39}$/i.test(code)) {
    return NextResponse.json(
      { error: "code is required (letters/numbers/-/_, max 40)." },
      { status: 400 }
    );
  }
  if (!name) {
    return NextResponse.json({ error: "name is required." }, { status: 400 });
  }

  const priceCents =
    data.priceCents !== undefined ? Number(data.priceCents) : undefined;
  const messageQuota =
    data.messageQuota !== undefined ? Number(data.messageQuota) : undefined;

  if (priceCents !== undefined && (!Number.isInteger(priceCents) || priceCents < 0)) {
    return NextResponse.json(
      { error: "priceCents must be a non-negative integer." },
      { status: 400 }
    );
  }
  if (
    messageQuota !== undefined &&
    (!Number.isInteger(messageQuota) || messageQuota < 0)
  ) {
    return NextResponse.json(
      { error: "messageQuota must be a non-negative integer." },
      { status: 400 }
    );
  }

  try {
    const plan = await createPlan({
      code,
      name,
      priceCents,
      currency: data.currency !== undefined ? String(data.currency) : undefined,
      interval: parseInterval(data.interval),
      messageQuota,
      isPromo: data.isPromo !== undefined ? Boolean(data.isPromo) : undefined,
      features:
        data.features !== undefined
          ? (data.features as Prisma.InputJsonValue)
          : undefined,
      active: data.active !== undefined ? Boolean(data.active) : undefined,
    });
    return NextResponse.json({ plan }, { status: 201 });
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "A plan with this code already exists." },
        { status: 409 }
      );
    }
    throw err;
  }
}
