/**
 * Provider registry + fallback execution.
 *
 * This is the ONLY module in the app that names a vendor. Routes, repositories
 * and UI all work with the opaque `providerId` that came out of a `ModelPrice`
 * row, so "use a cheaper/better vendor" is a data change, and "drop a vendor"
 * is three steps:
 *
 *   1. delete its adapter file and its single line in `ADAPTERS` below,
 *   2. remove its id from `AI_PROVIDER_ORDER`,
 *   3. set `active = false` on its `model_prices` rows.
 *
 * Nothing else in the codebase has to change, and step 2 or 3 alone is enough
 * to take a vendor out of rotation without a deploy.
 *
 * Only providers that are (a) registered, (b) listed in `AI_PROVIDER_ORDER` and
 * (c) actually configured with a key are allowed to serve traffic — and the
 * same filter is applied to the price list the browser quotes against, so the
 * client and the server can never quote a provider the server cannot use.
 *
 * Server-only.
 */
import { quote, type ModelPriceDTO, type QuoteInput } from "@/lib/ai/types";
import { kieProvider } from "./kie";
import { xaiProvider } from "./xai";
import { linkedSignal, readEnv } from "./http";
import type {
  GenerationProvider,
  ImageJobInput,
  ProviderResult,
  VideoJobInput,
} from "./types";

/** One line per adapter. Removing a vendor removes its line. */
const ADAPTERS: readonly GenerationProvider[] = [kieProvider, xaiProvider];

const REGISTRY = new Map<string, GenerationProvider>(
  ADAPTERS.map((adapter) => [adapter.id, adapter])
);

/** Each attempt gets its own slice of the budget so a slow primary cannot eat the fallback's. */
const ATTEMPT_BUDGET_MS = 300_000;

/** Returns the adapter for an id, or null when that vendor is not installed. */
export function getProvider(providerId: string): GenerationProvider | null {
  return REGISTRY.get(providerId) ?? null;
}

/**
 * Preference order from `AI_PROVIDER_ORDER` (e.g. "kie,xai"). Unknown ids are
 * ignored rather than fatal — an operator editing env must not be able to break
 * generation with a typo. Falls back to registration order when unset.
 */
export function providerOrder(): string[] {
  const configured = readEnv("AI_PROVIDER_ORDER");
  const ids = configured
    ? configured
        .split(",")
        .map((id) => id.trim().toLowerCase())
        .filter((id) => id.length > 0)
    : ADAPTERS.map((a) => a.id);

  const seen = new Set<string>();
  return ids.filter((id) => {
    if (seen.has(id) || !REGISTRY.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** Provider ids that are enabled by env AND hold the credentials they need. */
export function servableProviderIds(): Set<string> {
  return new Set(
    providerOrder().filter((id) => REGISTRY.get(id)?.isConfigured() === true)
  );
}

/**
 * Drops price rows whose provider cannot serve traffic right now. Applied to
 * both `GET /api/ai/prices` and the server-side re-quote.
 */
export function filterServablePrices(
  prices: readonly ModelPriceDTO[]
): ModelPriceDTO[] {
  const servable = servableProviderIds();
  return prices.filter((price) => servable.has(price.providerId));
}

export type GenerationAttempt = {
  providerId: string;
  modelId: string;
  priceId: string;
  /** Credits this row would charge for the request. */
  credits: number;
};

/**
 * Orders the providers that can serve this request: the authoritative quote
 * first (cheapest capable row — what the user is charged), then every other
 * configured provider in `AI_PROVIDER_ORDER` order, each with its own cheapest
 * capable row. `prices` must already be filtered to servable providers.
 */
export function buildAttemptPlan(
  prices: readonly ModelPriceDTO[],
  input: QuoteInput
): GenerationAttempt[] {
  const primary = quote(prices, input);
  if (!primary) return [];

  const attempts: GenerationAttempt[] = [
    {
      providerId: primary.providerId,
      modelId: primary.modelId,
      priceId: primary.priceId,
      credits: primary.credits,
    },
  ];

  for (const providerId of providerOrder()) {
    if (providerId === primary.providerId) continue;
    const perProvider = quote(
      prices.filter((price) => price.providerId === providerId),
      input
    );
    if (!perProvider) continue;
    attempts.push({
      providerId,
      modelId: perProvider.modelId,
      priceId: perProvider.priceId,
      credits: perProvider.credits,
    });
  }

  return attempts;
}

export type GenerationJob =
  | { modality: "video"; video: Omit<VideoJobInput, "modelId"> }
  | { modality: "image"; image: Omit<ImageJobInput, "modelId"> };

export type FallbackOutcome = {
  result: ProviderResult;
  /** The attempt that produced `result`. Null only when the plan was empty. */
  attempt: GenerationAttempt | null;
};

/**
 * Runs the plan until one provider returns an asset.
 *
 * Moves to the next provider on a retryable failure (timeout, 5xx, vendor job
 * failure) or when an adapter has no credentials. Stops on a non-retryable
 * failure — the request itself was rejected, so another vendor would reject it
 * too and the user should not wait twice for the same answer.
 */
export async function runWithFallback(
  attempts: readonly GenerationAttempt[],
  job: GenerationJob,
  signal: AbortSignal
): Promise<FallbackOutcome> {
  let last: ProviderResult = {
    ok: false,
    reason: "no_provider_available",
    retryable: false,
  };
  let lastAttempt: GenerationAttempt | null = null;

  for (const attempt of attempts) {
    if (signal.aborted) break;
    const provider = getProvider(attempt.providerId);
    if (!provider) continue;

    lastAttempt = attempt;
    const link = linkedSignal(signal, ATTEMPT_BUDGET_MS);
    try {
      last =
        job.modality === "video"
          ? await provider.generateVideo(
              { ...job.video, modelId: attempt.modelId },
              link.signal
            )
          : await provider.generateImage(
              { ...job.image, modelId: attempt.modelId },
              link.signal
            );
    } finally {
      link.dispose();
    }

    if (last.ok) return { result: last, attempt };
    if (!last.retryable && last.reason !== "provider_not_configured") break;
    if (signal.aborted) break;
  }

  return { result: last, attempt: lastAttempt };
}

export type { GenerationProvider, ProviderResult } from "./types";
