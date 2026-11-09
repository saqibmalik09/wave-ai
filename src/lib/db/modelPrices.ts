/**
 * Model price catalogue read.
 *
 * `GET /api/ai/prices` is hit on every composer load and the generate route
 * re-quotes against the same list on every request, so this read is cached
 * in-process with a short TTL and a singleflight guard: a burst of concurrent
 * callers shares ONE database query, and a stale-by-at-most-TTL price is fine
 * because the server always re-quotes authoritatively from this same list.
 *
 * A short in-process TTL is used rather than a framework cache so the behaviour
 * is identical in a route handler, a server component and a background sweep.
 *
 * The row shape is translated into the shared `ModelPriceDTO` here — the
 * Prisma enums (IMAGE/VIDEO/CHAT) are storage detail and never leak past this
 * file. CHAT rows are skipped: they are modelled for token pricing but are not
 * quotable yet.
 *
 * Server-only.
 */
import { prisma } from "@/lib/db/prisma";
import {
  VIDEO_RESOLUTIONS,
  type ModelPriceDTO,
  type PriceUnit,
  type VideoResolution,
} from "@/lib/ai/types";

/** Prices change by admin action, not by the second. */
const TTL_MS = 30_000;

/** Bounds the catalogue read — the list is a catalogue, not user data. */
const MAX_ROWS = 500;

const priceSelect = {
  id: true,
  providerId: true,
  modelId: true,
  modality: true,
  resolution: true,
  unit: true,
  credits: true,
  supportsReference: true,
  label: true,
} as const;

type CacheEntry = { prices: ModelPriceDTO[]; expiresAt: number };

let cache: CacheEntry | null = null;
/** Shared promise so concurrent misses issue a single query (singleflight). */
let inFlight: Promise<ModelPriceDTO[]> | null = null;

function toVideoResolution(value: string | null): VideoResolution | null {
  if (!value) return null;
  return VIDEO_RESOLUTIONS.includes(value as VideoResolution)
    ? (value as VideoResolution)
    : null;
}

async function queryActivePrices(): Promise<ModelPriceDTO[]> {
  const rows = await prisma.modelPrice.findMany({
    where: { active: true, modality: { in: ["IMAGE", "VIDEO"] } },
    select: priceSelect,
    orderBy: [{ credits: "asc" }, { id: "asc" }],
    take: MAX_ROWS,
  });

  const prices: ModelPriceDTO[] = [];
  for (const row of rows) {
    const resolution = toVideoResolution(row.resolution);
    // A video row without a resolution we recognise cannot be quoted safely.
    if (row.modality === "VIDEO" && resolution === null) continue;

    prices.push({
      id: row.id,
      providerId: row.providerId,
      modelId: row.modelId,
      modality: row.modality === "VIDEO" ? "video" : "image",
      resolution: row.modality === "VIDEO" ? resolution : null,
      unit: row.unit as PriceUnit,
      credits: row.credits,
      supportsReference: row.supportsReference,
      label: row.label,
    });
  }
  return prices;
}

/**
 * Every active, quotable price row. Returns exactly the shared
 * `ModelPriceDTO` shape so the browser and the server quote identically.
 */
export async function listActivePrices(): Promise<ModelPriceDTO[]> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.prices;
  if (inFlight) return inFlight;

  const flight = queryActivePrices().then((prices) => {
    cache = { prices, expiresAt: Date.now() + TTL_MS };
    return prices;
  });
  inFlight = flight;
  // Release the slot whichever way it settles, without creating an unhandled
  // rejection on this branch (the awaiting caller handles the error).
  void flight
    .catch(() => undefined)
    .finally(() => {
      if (inFlight === flight) inFlight = null;
    });

  try {
    return await flight;
  } catch (err) {
    // Serve the last good catalogue rather than failing the composer outright;
    // the prices are a cache read, not an authorisation decision.
    if (cache) return cache.prices;
    throw err;
  }
}

/** Drops the cached catalogue. Call after an admin edits a price row. */
export function invalidateActivePrices(): void {
  cache = null;
}
