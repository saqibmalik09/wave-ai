/**
 * The provider seam.
 *
 * Generation vendors are commodities: prices drop, quality jumps, APIs get
 * deprecated. So nothing above this file is allowed to know which vendor served
 * a request — routes resolve an adapter through the registry (`./index`) using
 * the `providerId` that came out of the shared `quote()`, and that id came from
 * a database row. Swapping or dropping a vendor is therefore a data change plus
 * one file, never a change to a route, a component, or this interface.
 *
 * Rules every adapter must honour:
 *  - take the caller's `AbortSignal` and stop all work when it fires (the route
 *    owns the deadline, not the vendor),
 *  - never throw for an expected vendor failure — return `ok: false` with
 *    `retryable` so the registry can decide whether the next provider gets a
 *    turn,
 *  - never log keys, prompts, or reference URLs (prompts are user content),
 *  - report cost in ticks when the vendor reports one, otherwise `null` so the
 *    ledger keeps the server-side estimate.
 *
 * Server-only: adapters read secrets from `process.env`.
 */
import type { AspectRatio, VideoDuration, VideoResolution } from "@/lib/ai/types";

export type VideoJobInput = {
  /** Vendor-specific model id, straight from the chosen `ModelPrice` row. */
  modelId: string;
  prompt: string;
  resolution: VideoResolution;
  durationSeconds: VideoDuration;
  aspectRatio: AspectRatio;
  /** Already clamped to MAX_REFERENCE_IMAGES by the caller. May be empty. */
  referenceImageUrls: string[];
};

export type ImageJobInput = {
  modelId: string;
  prompt: string;
  aspectRatio: AspectRatio;
  referenceImageUrls: string[];
};

export type ProviderSuccess = {
  ok: true;
  /** URL of the finished asset as the vendor returned it. */
  assetUrl: string;
  /** Vendor-reported cost, 1 USD = 10^10 ticks. Null when not reported. */
  costTicks: bigint | null;
  /** Vendor's own job id, stored on the ledger row for reconciliation. */
  providerRequestId: string;
};

export type ProviderFailure = {
  ok: false;
  /** Short, non-sensitive machine reason, e.g. "timeout" / "vendor_5xx". */
  reason: string;
  /** True when another provider (or a later retry) could plausibly succeed. */
  retryable: boolean;
};

export type ProviderResult = ProviderSuccess | ProviderFailure;

export interface GenerationProvider {
  /** Opaque key that matches `ModelPrice.providerId`. */
  readonly id: string;
  /** True when the adapter has the credentials it needs. */
  isConfigured(): boolean;
  generateVideo(
    input: VideoJobInput,
    signal: AbortSignal
  ): Promise<ProviderResult>;
  generateImage(
    input: ImageJobInput,
    signal: AbortSignal
  ): Promise<ProviderResult>;
}
