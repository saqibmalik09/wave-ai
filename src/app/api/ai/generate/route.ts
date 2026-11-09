import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import {
  ASPECT_RATIOS,
  MAX_DURATION_WITH_REFERENCE,
  MAX_REFERENCE_IMAGES,
  VIDEO_DURATIONS,
  VIDEO_RESOLUTIONS,
  quote,
  type AspectRatio,
  type GenerationRefusal,
  type Modality,
  type VideoDuration,
  type VideoResolution,
} from "@/lib/ai/types";
import {
  buildAttemptPlan,
  filterServablePrices,
  runWithFallback,
  type GenerationJob,
} from "@/lib/ai/providers";
import { listActivePrices } from "@/lib/db/modelPrices";
import {
  selfOrigins,
  userKeyPrefix,
  verifyReferenceUrl,
} from "@/lib/storage/signing";
import {
  emptyWallet,
  getWallet,
  refundReservation,
  reserve,
  settle,
} from "@/lib/db/credits";

/**
 * Run one generation and charge for it.
 *
 * The order is deliberate and is the whole point of this handler:
 *
 *   authenticate → validate + clamp to the shared model limits → RE-QUOTE
 *   server-side with the same pure `quote()` the browser used → reserve the
 *   credits → call a provider (with fallback) → settle with the provider's own
 *   reported cost, or refund the hold in full.
 *
 * Reference images are NOT inlined in this body: they are uploaded to
 * `POST /api/ai/uploads` first and arrive here as signed, expiring URLs that
 * only this service can mint. A caller-supplied URL from anywhere else is
 * refused, and no URL in this body is ever fetched by us.
 *
 * The client's price is never read. `Idempotency-Key` is mandatory, so a retry
 * after a dropped connection cannot start a second paid job: the key is
 * namespaced per user and unique in the database, and a replay is reported as
 * a conflict rather than silently charged again.
 *
 * Provider choice is data, not code: the cheapest capable `ModelPrice` row wins
 * and its opaque `providerId` is resolved through the registry. No vendor is
 * named anywhere in this file.
 */

/** Prompts are user content: bounded, never logged. */
const MAX_PROMPT_LENGTH = 2_000;
const MAX_HTTP_URL_LENGTH = 2_048;
/**
 * DEPRECATED compatibility path — remove in the release after uploads ship.
 *
 * Reference images used to be inlined as base64 `data:` URLs, which put up to
 * 7 x 10 MB (base64-expanded) inside one JSON POST. They now go through
 * `POST /api/ai/uploads` and arrive here as signed URLs. These two constants
 * and the `data:` branch in `parseReferenceUrls` exist only so clients already
 * in the wild keep working for one release; delete them (and the branch) once
 * the composer has switched.
 */
const MAX_DATA_URL_LENGTH = 6_000_000;
const MAX_REFERENCE_PAYLOAD = 18_000_000;
const DATA_IMAGE_PREFIX = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const MIN_IDEMPOTENCY_KEY = 8;
/**
 * `credit_ledger.idempotencyKey` is a unique VARCHAR(191). The stored key is
 * `<userId>:<client key>` plus a short retry suffix, so the client's half is
 * capped well inside that budget — a truncated key would merge two different
 * generations onto one ledger row.
 */
const MAX_IDEMPOTENCY_KEY = 120;

/**
 * How many times one client key may be reserved. A client that retries an
 * unchanged request correctly reuses its key; each genuine retry (after the
 * previous attempt FAILED and was refunded in full) gets its own derived key,
 * so the charge stays exactly-once per attempt while retry still works.
 */
const MAX_ATTEMPTS_PER_KEY = 3;

/** Total wall-clock budget for one request, across every provider attempt. */
const ROUTE_BUDGET_MS = 540_000;

/** HTTP status for each refusal, so the UI can react without string matching. */
const REFUSAL_STATUS: Record<GenerationRefusal, number> = {
  insufficient_credits: 402,
  weekly_limit_reached: 429,
  no_active_plan: 403,
  unsupported_request: 400,
};

const REFUSAL_MESSAGE: Record<GenerationRefusal, string> = {
  insufficient_credits: "Not enough credits for this generation.",
  weekly_limit_reached: "You have reached this week's credit limit.",
  no_active_plan: "No active plan. Choose a plan to start generating.",
  unsupported_request: "This combination of options cannot be generated.",
};

function refusalResponse(refusal: GenerationRefusal) {
  return NextResponse.json(
    { error: REFUSAL_MESSAGE[refusal], refusal },
    { status: REFUSAL_STATUS[refusal] }
  );
}

function parseModality(value: unknown): Modality | null {
  return value === "image" || value === "video" ? value : null;
}

function parseResolution(value: unknown): VideoResolution | null {
  return VIDEO_RESOLUTIONS.includes(value as VideoResolution)
    ? (value as VideoResolution)
    : null;
}

function parseDuration(value: unknown): VideoDuration | null {
  const n = Number(value);
  return VIDEO_DURATIONS.includes(n as VideoDuration)
    ? (n as VideoDuration)
    : null;
}

function parseAspectRatio(value: unknown): AspectRatio | null {
  return ASPECT_RATIOS.some((option) => option.value === value)
    ? (value as AspectRatio)
    : null;
}

/**
 * Validates reference images, de-duplicates them and CLAMPS the list to
 * `MAX_REFERENCE_IMAGES`.
 *
 * Only two forms are accepted:
 *
 *  1. a URL THIS SERVICE ISSUED from `POST /api/ai/uploads` — verified by its
 *     HMAC signature, its expiry, and the per-user key prefix. An arbitrary
 *     caller-supplied URL is refused: handing one to a provider (or fetching
 *     it ourselves) would be an SSRF, and we never do either. The URL is only
 *     parsed and checked, never requested.
 *  2. a bounded base64 `data:image/*` URL — DEPRECATED, see the constants
 *     above. Kept for one release so clients already in the wild keep working.
 *
 * An unusable entry is an error, never a silent drop: dropping one would change
 * the reference count, and the reference count changes which models can serve
 * the request — i.e. the price. Client and server must quote the same thing.
 */
async function parseReferenceUrls(
  value: unknown,
  allowedOrigins: readonly string[],
  /** Lazy: a request with no references should not derive a prefix at all. */
  ownerPrefix: () => Promise<string>
): Promise<{ ok: true; urls: string[] } | { ok: false; error: string }> {
  if (value === undefined || value === null) return { ok: true, urls: [] };
  if (!Array.isArray(value)) {
    return { ok: false, error: "referenceImageUrls must be an array." };
  }

  const urls: string[] = [];
  let payloadBytes = 0;
  let prefix: string | null = null;

  // Clamp first: extra attachments are ignored, not rejected.
  for (const entry of value.slice(0, MAX_REFERENCE_IMAGES)) {
    if (typeof entry !== "string" || entry.length === 0) {
      return { ok: false, error: "Each reference image must be a URL string." };
    }

    // DEPRECATED inline path.
    if (entry.startsWith("data:")) {
      if (entry.length > MAX_DATA_URL_LENGTH || !DATA_IMAGE_PREFIX.test(entry)) {
        return {
          ok: false,
          error: "Reference images must be PNG, JPEG, WebP or GIF, under 6 MB.",
        };
      }
      payloadBytes += entry.length;
      if (payloadBytes > MAX_REFERENCE_PAYLOAD) {
        return { ok: false, error: "Reference images are too large in total." };
      }
      if (!urls.includes(entry)) urls.push(entry);
      continue;
    }

    if (entry.length > MAX_HTTP_URL_LENGTH) {
      return { ok: false, error: "Reference image URL is too long." };
    }

    prefix ??= await ownerPrefix();
    const verified = await verifyReferenceUrl(entry, allowedOrigins, prefix);
    if (!verified.ok) {
      return {
        ok: false,
        error:
          verified.reason === "expired"
            ? "A reference image has expired. Upload it again."
            : "Reference images must be uploaded to /api/ai/uploads first.",
      };
    }
    if (!urls.includes(entry)) urls.push(entry);
  }

  return { ok: true, urls };
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }
  if (user.role === "guest" || user.email === null) {
    return NextResponse.json(
      { error: "Create an account to generate." },
      { status: 403 }
    );
  }

  const rawKey = request.headers.get("idempotency-key")?.trim() ?? "";
  if (
    rawKey.length < MIN_IDEMPOTENCY_KEY ||
    rawKey.length > MAX_IDEMPOTENCY_KEY ||
    !/^[A-Za-z0-9._:-]+$/.test(rawKey)
  ) {
    return NextResponse.json(
      {
        error: `An Idempotency-Key header is required (${MIN_IDEMPOTENCY_KEY}-${MAX_IDEMPOTENCY_KEY} chars, letters/digits/.-_:).`,
      },
      { status: 400 }
    );
  }
  // Namespaced per user: one account can never collide with — or probe —
  // another account's key.
  const idempotencyKey = `${user.id}:${rawKey}`;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const data = (body ?? {}) as Record<string, unknown>;

  const modality = parseModality(data.modality);
  if (!modality) {
    return NextResponse.json(
      { error: "modality must be 'image' or 'video'." },
      { status: 400 }
    );
  }

  const prompt = String(data.prompt ?? "").trim();
  if (!prompt || prompt.length > MAX_PROMPT_LENGTH) {
    return NextResponse.json(
      { error: `prompt is required (max ${MAX_PROMPT_LENGTH} characters).` },
      { status: 400 }
    );
  }

  const references = await parseReferenceUrls(
    data.referenceImageUrls,
    selfOrigins(request),
    () => userKeyPrefix(user.id)
  );
  if (!references.ok) {
    return NextResponse.json({ error: references.error }, { status: 400 });
  }
  const referenceImageUrls = references.urls;
  const hasReferences = referenceImageUrls.length > 0;

  // A reference image pins the output frame, so the ratio is the source's.
  const requestedAspect = parseAspectRatio(data.aspectRatio) ?? "auto";
  const aspectRatio: AspectRatio = hasReferences ? "auto" : requestedAspect;

  let resolution: VideoResolution | undefined;
  let duration: VideoDuration | undefined;
  if (modality === "video") {
    resolution = parseResolution(data.resolution) ?? "480p";
    const requested = parseDuration(data.duration) ?? VIDEO_DURATIONS[0];
    // Clamp, don't reject: the model cannot run longer with references.
    duration =
      hasReferences && requested > MAX_DURATION_WITH_REFERENCE
        ? MAX_DURATION_WITH_REFERENCE
        : requested;
  }

  // Authoritative re-quote: same pure function as the composer, but over the
  // catalogue the server can actually serve.
  const prices = filterServablePrices(await listActivePrices());
  const quoteInput = {
    modality,
    resolution,
    duration,
    referenceCount: referenceImageUrls.length,
  };
  const serverQuote = quote(prices, quoteInput);
  if (!serverQuote) return refusalResponse("unsupported_request");

  const attempts = buildAttemptPlan(prices, quoteInput);
  if (attempts.length === 0) return refusalResponse("unsupported_request");

  // Hold the credits BEFORE any provider is called.
  let reservation: { key: string; credits: number } | null = null;
  for (let retry = 0; retry < MAX_ATTEMPTS_PER_KEY; retry += 1) {
    const key = retry === 0 ? idempotencyKey : `${idempotencyKey}#r${retry + 1}`;
    const held = await reserve({
      userId: user.id,
      kind: modality === "video" ? "VIDEO" : "IMAGE",
      idempotencyKey: key,
      credits: serverQuote.credits,
      providerId: serverQuote.providerId,
    });
    if (!held.ok) return refusalResponse(held.refusal);
    if (!held.replayed) {
      reservation = { key, credits: held.credits };
      break;
    }
    // A fully refunded failure may be retried under the next derived key.
    if (held.status === "FAILED") continue;
    // Still running, or already paid for: charging again is the one thing
    // idempotency exists to prevent, so report the conflict instead.
    return NextResponse.json(
      {
        error:
          held.status === "RESERVED"
            ? "This generation is already running."
            : "This generation was already processed.",
        idempotent: true,
        status: held.status,
      },
      { status: 409 }
    );
  }
  if (!reservation) {
    return NextResponse.json(
      {
        error: "This generation failed repeatedly. Change something and retry.",
        idempotent: true,
      },
      { status: 409 }
    );
  }
  const ledgerKey = reservation.key;

  const job: GenerationJob =
    modality === "video"
      ? {
          modality: "video",
          video: {
            prompt,
            resolution: resolution ?? "480p",
            durationSeconds: duration ?? VIDEO_DURATIONS[0],
            aspectRatio,
            referenceImageUrls,
          },
        }
      : {
          modality: "image",
          image: { prompt, aspectRatio, referenceImageUrls },
        };

  // Our own deadline, deliberately NOT chained to `request.signal`: if the
  // browser goes away the job is already in flight at the vendor, and we still
  // want to settle or refund the ledger row correctly rather than abandon it.
  const controller = new AbortController();
  const budgetTimer = setTimeout(
    () => controller.abort(new Error("route_budget_exceeded")),
    ROUTE_BUDGET_MS
  );

  let outcome;
  try {
    outcome = await runWithFallback(attempts, job, controller.signal);
  } catch {
    // An adapter is contractually not allowed to throw; if one does, the hold
    // must still come back.
    clearTimeout(budgetTimer);
    await refundReservation({
      idempotencyKey: ledgerKey,
      reason: "provider_exception",
    });
    return NextResponse.json(
      { error: "Generation failed. Your credits were not charged." },
      { status: 502 }
    );
  }
  clearTimeout(budgetTimer);

  if (!outcome.result.ok) {
    await refundReservation({
      idempotencyKey: ledgerKey,
      // Our own short machine string — never vendor text or user content.
      reason: outcome.result.reason,
    });
    const wallet = (await getWallet(user.id)) ?? emptyWallet();
    return NextResponse.json(
      {
        error: "Generation failed. Your credits were not charged.",
        reason: outcome.result.reason,
        wallet,
      },
      { status: 502 }
    );
  }

  const settled = await settle({
    idempotencyKey: ledgerKey,
    // The provider's own number when it reports one; null keeps the estimate.
    costTicks: outcome.result.costTicks,
    providerId: outcome.attempt?.providerId ?? null,
    providerRequestId: outcome.result.providerRequestId,
  });

  const wallet = (await getWallet(user.id)) ?? emptyWallet();
  return NextResponse.json(
    {
      assetUrl: outcome.result.assetUrl,
      creditsCharged: settled.ok ? settled.creditsCharged : reservation.credits,
      wallet,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
