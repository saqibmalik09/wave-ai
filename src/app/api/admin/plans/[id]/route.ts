import { NextResponse } from "next/server";
import { guardApi } from "@/lib/auth/api";
import { getPlanById, updatePlan } from "@/lib/db/plans";
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

/** Admin: update a plan by id. Accepts any subset of mutable fields. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardApi("ADMIN");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const existing = await getPlanById(id);
  if (!existing) {
    return NextResponse.json({ error: "Plan not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const data = (body ?? {}) as Record<string, unknown>;
  const patch: Parameters<typeof updatePlan>[1] = {};

  if (data.name !== undefined) {
    const v = String(data.name).trim();
    if (!v) {
      return NextResponse.json(
        { error: "name cannot be empty." },
        { status: 400 }
      );
    }
    patch.name = v;
  }
  if (data.priceCents !== undefined) {
    const v = Number(data.priceCents);
    if (!Number.isInteger(v) || v < 0) {
      return NextResponse.json(
        { error: "priceCents must be a non-negative integer." },
        { status: 400 }
      );
    }
    patch.priceCents = v;
  }
  if (data.messageQuota !== undefined) {
    const v = Number(data.messageQuota);
    if (!Number.isInteger(v) || v < 0) {
      return NextResponse.json(
        { error: "messageQuota must be a non-negative integer." },
        { status: 400 }
      );
    }
    patch.messageQuota = v;
  }
  if (data.currency !== undefined) patch.currency = String(data.currency);
  if (data.interval !== undefined) {
    const parsed = parseInterval(data.interval);
    if (!parsed) {
      return NextResponse.json(
        { error: "interval must be FREE | MONTH | YEAR | LIFETIME." },
        { status: 400 }
      );
    }
    patch.interval = parsed;
  }
  if (data.isPromo !== undefined) patch.isPromo = Boolean(data.isPromo);
  if (data.active !== undefined) patch.active = Boolean(data.active);
  if (data.features !== undefined) {
    patch.features = data.features as Prisma.InputJsonValue;
  }

  const plan = await updatePlan(id, patch);
  return NextResponse.json({ plan });
}
