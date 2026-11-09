/**
 * Shared AI + credits contract.
 *
 * This module is the ONE place the server and the browser agree on. It is
 * intentionally dependency-free and side-effect-free so it can be imported
 * from a Client Component (the composer needs to quote a generation locally,
 * without a round trip per keystroke) and from route handlers (which re-quote
 * authoritatively and never trust the client's number).
 *
 * Credits: 1 credit = $0.0001 USD, i.e. 10,000 credits = $1. Costs are always
 * whole credits — never floats — so balances add up exactly.
 */

/** 10,000 credits = 1 USD. */
export const CREDITS_PER_USD = 10_000;

/** xAI reports cost in ticks where 1 USD = 10^10 ticks. */
export const TICKS_PER_USD = 10_000_000_000;

/**
 * Converts a provider-reported tick cost into whole credits, rounding up.
 *
 * BigInt *literals* (`1n`) need an ES2020 target and this project compiles to
 * ES2017, so the constants are built with the `BigInt()` call instead.
 */
export function ticksToCredits(ticks: bigint | number): number {
  const t =
    typeof ticks === "bigint"
      ? ticks
      : BigInt(Math.max(0, Math.trunc(ticks)));
  const perCredit = BigInt(TICKS_PER_USD / CREDITS_PER_USD);
  const one = BigInt(1);
  // Round up so a fractional credit is never given away for free.
  return Number((t + perCredit - one) / perCredit);
}

/** Converts a USD amount into whole credits, rounding up. */
export function usdToCredits(usd: number): number {
  return Math.ceil(usd * CREDITS_PER_USD);
}

export type Modality = "image" | "video";

/** Only 480p and 720p ship today; 1080p is a price row away. */
export type VideoResolution = "480p" | "720p";

export const VIDEO_RESOLUTIONS: readonly VideoResolution[] = ["480p", "720p"];

export type VideoDuration = 6 | 10 | 15;

export const VIDEO_DURATIONS: readonly VideoDuration[] = [6, 10, 15];

/**
 * Aspect ratios offered in the Imagine composer. `auto` lets the model choose
 * (and is forced when an input image pins the frame, since the output always
 * matches the source image).
 */
export type AspectRatio =
  | "auto"
  | "2:3"
  | "3:2"
  | "4:3"
  | "1:1"
  | "9:16"
  | "16:9"
  | "21:9"
  | "5:2";

export type AspectRatioOption = {
  value: AspectRatio;
  /** Human label shown next to the ratio, e.g. "Story". */
  label: string;
  /** Width/height used to draw the preview box. `null` for auto. */
  ratio: number | null;
};

export const ASPECT_RATIOS: readonly AspectRatioOption[] = [
  { value: "auto", label: "Auto", ratio: null },
  { value: "2:3", label: "Poster", ratio: 2 / 3 },
  { value: "3:2", label: "Photo Print", ratio: 3 / 2 },
  { value: "4:3", label: "Presentation", ratio: 4 / 3 },
  { value: "1:1", label: "Square", ratio: 1 },
  { value: "9:16", label: "Story", ratio: 9 / 16 },
  { value: "16:9", label: "Widescreen", ratio: 16 / 9 },
  { value: "21:9", label: "Cinematic", ratio: 21 / 9 },
  { value: "5:2", label: "Banner", ratio: 5 / 2 },
];

/**
 * Hard model limits we must respect regardless of what the UI sends.
 * Reference-conditioned generation caps both the clip length and the number of
 * images, so the composer clamps and the server re-validates.
 */
export const MAX_REFERENCE_IMAGES = 7;
export const MAX_DURATION_WITH_REFERENCE: VideoDuration = 10;

/** How a price row is metered. */
export type PriceUnit = "SECOND" | "IMAGE" | "TOKEN";

/**
 * One priced capability, mirrored from the `ModelPrice` table. The browser
 * fetches these once from `GET /api/ai/prices` and quotes locally.
 */
export type ModelPriceDTO = {
  id: string;
  /** Opaque provider key, e.g. "kie" or "xai". Never branch on this in the UI. */
  providerId: string;
  /** Provider-specific model id, e.g. "grok-imagine-video-1.5". */
  modelId: string;
  modality: Modality;
  /** Null for images and chat. */
  resolution: VideoResolution | null;
  unit: PriceUnit;
  /** Credits charged per unit (per second / per image / per 1K tokens). */
  credits: number;
  /** True when this row's model accepts reference images. */
  supportsReference: boolean;
  /** Shown in the UI as the quality tier, e.g. "Standard" / "Best". */
  label: string;
};

export type QuoteInput = {
  modality: Modality;
  resolution?: VideoResolution;
  duration?: VideoDuration;
  referenceCount?: number;
};

export type Quote = {
  /** Whole credits this generation will cost. */
  credits: number;
  /** The price row chosen to serve it. */
  priceId: string;
  modelId: string;
  providerId: string;
};

/**
 * Picks the cheapest price row that can actually serve the request, then
 * computes the cost. Pure: same inputs always give the same answer on the
 * client and the server.
 *
 * Returns null when nothing in the catalogue can serve the request (e.g. the
 * user attached references but no reference-capable model is active).
 */
export function quote(
  prices: readonly ModelPriceDTO[],
  input: QuoteInput
): Quote | null {
  const needsReference = (input.referenceCount ?? 0) > 0;

  const candidates = prices.filter((p) => {
    if (p.modality !== input.modality) return false;
    if (needsReference && !p.supportsReference) return false;
    if (input.modality === "video" && p.resolution !== input.resolution) {
      return false;
    }
    return true;
  });
  if (candidates.length === 0) return null;

  // Cheapest row wins; ties resolve on id so the choice is deterministic.
  const chosen = candidates.reduce((best, p) =>
    p.credits < best.credits || (p.credits === best.credits && p.id < best.id)
      ? p
      : best
  );

  let credits: number;
  if (input.modality === "video") {
    const seconds = input.duration ?? 6;
    credits = chosen.credits * seconds;
  } else {
    credits = chosen.credits;
  }

  return {
    credits,
    priceId: chosen.id,
    modelId: chosen.modelId,
    providerId: chosen.providerId,
  };
}

/** What `GET /api/me/credits` returns. */
export type WalletDTO = {
  planName: string;
  /** Credits granted for the current period. */
  granted: number;
  /** Credits consumed so far this period (settled + still reserved). */
  used: number;
  /** granted - used, floored at 0. */
  remaining: number;
  /** 0-100, rounded to one decimal. */
  percentUsed: number;
  /** 0 means no weekly cap. */
  weeklyLimit: number;
  weeklyUsed: number;
  weeklyRemaining: number;
  /** ISO date of the Monday that starts the current usage week. */
  weekStart: string;
};

/** Why a generation was refused, so the UI can say something specific. */
export type GenerationRefusal =
  | "insufficient_credits"
  | "weekly_limit_reached"
  | "no_active_plan"
  | "unsupported_request";

// ---------------------------------------------------------------------------
// Reference-image uploads (appended — nothing above changed).
//
// Reference images are uploaded to `POST /api/ai/uploads` FIRST, and the URL it
// returns is what goes into `referenceImageUrls` on `POST /api/ai/generate`.
// The generate route accepts only URLs this service issued and signed, so a
// client must not invent one.
// ---------------------------------------------------------------------------

/** Hard upload limit, enforced server-side. Clamp in the picker to match. */
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Containers accepted by the upload endpoint. The server verifies the real
 * container from magic bytes, so these are only useful for the file picker's
 * `accept` attribute and a friendly pre-check.
 */
export const UPLOAD_ACCEPTED_MIME: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
];

/** What `POST /api/ai/uploads` returns on success (201). */
export type UploadedReferenceDTO = {
  /** Absolute, signed, expiring URL. Pass it through verbatim. */
  url: string;
  /** ISO timestamp after which the URL stops working. */
  expiresAt: string;
  /** Container the server detected, not what the client claimed. */
  contentType: string;
  /** Stored size in bytes. */
  size: number;
};
