/**
 * xAI direct adapter — the FALLBACK provider.
 *
 * It exists so a single vendor outage (or a withdrawn model) cannot take
 * generation down: its `ModelPrice` rows are priced above Kie's, so the shared
 * `quote()` never picks it first, but the registry will reach for it when the
 * cheaper provider fails. Same deal as every adapter — it is removable without
 * touching a route.
 *
 * Shape of the vendor API: submit returns a `request_id`, then the same URL
 * plus the id is polled until `status` is terminal. Unlike Kie, xAI reports the
 * real cost of the job in `usage.cost_in_usd_ticks` (1 USD = 10^10 ticks), so
 * we settle the ledger with the vendor's own number instead of our estimate.
 *
 * Config: `XAI_API_KEY` (required), `XAI_BASE_URL` (optional override).
 * Server-only.
 */
import type {
  GenerationProvider,
  ImageJobInput,
  ProviderResult,
  VideoJobInput,
} from "./types";
import {
  normalizeBaseUrl,
  pollUntil,
  readEnv,
  requestJson,
  type PollDecision,
} from "./http";

export const XAI_PROVIDER_ID = "xai";

const DEFAULT_BASE_URL = "https://api.x.ai";
const VIDEO_PATH = "/v1/videos/generations";
const IMAGE_PATH = "/v1/images/generations";

const SUBMIT_TIMEOUT_MS = 30_000;
const SUBMIT_RETRIES = 2;
const PROBE_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 3_000;
const POLL_TOTAL_MS = 300_000;

/**
 * Deliberately loose: xAI returns the finished asset inline for images and
 * behind a poll for video, and has shipped more than one envelope shape. We
 * narrow defensively rather than trusting any single field to exist.
 */
type XaiJobResponse = {
  request_id?: string;
  id?: string;
  status?: string;
  state?: string;
  url?: string;
  video_url?: string;
  error?: string | { message?: string };
  video?: { url?: string };
  data?: Array<{ url?: string }>;
  usage?: { cost_in_usd_ticks?: number | string };
};

function baseUrl(): string {
  return normalizeBaseUrl(readEnv("XAI_BASE_URL") ?? DEFAULT_BASE_URL);
}

function authHeaders(key: string): Record<string, string> {
  return { authorization: `Bearer ${key}`, accept: "application/json" };
}

function requestIdOf(body: XaiJobResponse): string | null {
  return body.request_id ?? body.id ?? null;
}

function assetUrlOf(body: XaiJobResponse): string | null {
  const candidate =
    body.video?.url ??
    body.video_url ??
    body.url ??
    body.data?.find((d) => typeof d?.url === "string" && d.url.length > 0)?.url;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

/** Vendor cost in ticks, or null when the response did not carry one. */
function costTicksOf(body: XaiJobResponse): bigint | null {
  const raw = body.usage?.cost_in_usd_ticks;
  if (raw === undefined || raw === null) return null;
  try {
    const ticks =
      typeof raw === "string" ? BigInt(raw) : BigInt(Math.trunc(raw));
    return ticks < BigInt(0) ? null : ticks;
  } catch {
    return null;
  }
}

type Phase = "pending" | "done" | "failed";

function phaseOf(body: XaiJobResponse): Phase {
  const status = (body.status ?? body.state ?? "").toLowerCase();
  if (["completed", "succeeded", "success", "ready"].includes(status)) {
    return "done";
  }
  if (["failed", "error", "canceled", "cancelled", "expired"].includes(status)) {
    return "failed";
  }
  // No status at all but an asset present = synchronous completion (images).
  if (!status && assetUrlOf(body)) return "done";
  return "pending";
}

function success(body: XaiJobResponse, requestId: string, assetUrl: string): ProviderResult {
  return {
    ok: true,
    assetUrl,
    costTicks: costTicksOf(body),
    providerRequestId: requestId,
  };
}

async function runJob(
  apiKey: string,
  path: string,
  payload: Record<string, unknown>,
  signal: AbortSignal
): Promise<ProviderResult> {
  const submit = await requestJson<XaiJobResponse>({
    method: "POST",
    url: `${baseUrl()}${path}`,
    headers: authHeaders(apiKey),
    body: payload,
    signal,
    timeoutMs: SUBMIT_TIMEOUT_MS,
    retries: SUBMIT_RETRIES,
  });
  if (!submit.ok) {
    return { ok: false, reason: submit.reason, retryable: submit.retryable };
  }

  const requestId = requestIdOf(submit.data);

  // Images can come back finished on the submit call — no poll needed.
  if (phaseOf(submit.data) === "done") {
    const url = assetUrlOf(submit.data);
    if (url) return success(submit.data, requestId ?? "", url);
  }
  if (!requestId) {
    return { ok: false, reason: "missing_request_id", retryable: false };
  }

  const probe = async (probeSignal: AbortSignal): Promise<PollDecision<XaiJobResponse>> => {
    const status = await requestJson<XaiJobResponse>({
      method: "GET",
      url: `${baseUrl()}${path}/${encodeURIComponent(requestId)}`,
      headers: authHeaders(apiKey),
      signal: probeSignal,
      timeoutMs: PROBE_TIMEOUT_MS,
      retries: 1,
    });
    if (!status.ok) {
      return status.retryable
        ? { state: "pending" }
        : { state: "failed", reason: status.reason, retryable: false };
    }

    switch (phaseOf(status.data)) {
      case "done": {
        const url = assetUrlOf(status.data);
        return url
          ? { state: "done", value: status.data }
          : { state: "failed", reason: "missing_asset_url", retryable: true };
      }
      case "failed":
        return { state: "failed", reason: "vendor_job_failed", retryable: true };
      default:
        return { state: "pending" };
    }
  };

  const result = await pollUntil<XaiJobResponse>({
    probe,
    signal,
    totalMs: POLL_TOTAL_MS,
    intervalMs: POLL_INTERVAL_MS,
  });
  if (!result.ok) {
    return { ok: false, reason: result.reason, retryable: result.retryable };
  }

  const url = assetUrlOf(result.value);
  if (!url) {
    return { ok: false, reason: "missing_asset_url", retryable: true };
  }
  return success(result.value, requestId, url);
}

function missingKey(): ProviderResult {
  return { ok: false, reason: "provider_not_configured", retryable: false };
}

export const xaiProvider: GenerationProvider = {
  id: XAI_PROVIDER_ID,

  isConfigured() {
    return readEnv("XAI_API_KEY") !== null;
  },

  async generateVideo(input: VideoJobInput, signal) {
    const apiKey = readEnv("XAI_API_KEY");
    if (!apiKey) return missingKey();

    return runJob(
      apiKey,
      VIDEO_PATH,
      {
        model: input.modelId,
        prompt: input.prompt,
        duration: input.durationSeconds,
        resolution: input.resolution,
        ...(input.aspectRatio === "auto"
          ? {}
          : { aspect_ratio: input.aspectRatio }),
        ...(input.referenceImageUrls.length > 0
          ? { image_urls: input.referenceImageUrls }
          : {}),
      },
      signal
    );
  },

  async generateImage(input: ImageJobInput, signal) {
    const apiKey = readEnv("XAI_API_KEY");
    if (!apiKey) return missingKey();

    return runJob(
      apiKey,
      IMAGE_PATH,
      {
        model: input.modelId,
        prompt: input.prompt,
        n: 1,
        ...(input.aspectRatio === "auto"
          ? {}
          : { aspect_ratio: input.aspectRatio }),
        ...(input.referenceImageUrls.length > 0
          ? { image_urls: input.referenceImageUrls }
          : {}),
      },
      signal
    );
  },
};
