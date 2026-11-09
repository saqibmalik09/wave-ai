/**
 * Kie.ai adapter — the PRIMARY generation provider today, purely because its
 * `ModelPrice` rows are the cheapest capable ones. Nothing here is special:
 * delete this file, drop "kie" from `AI_PROVIDER_ORDER` and deactivate its
 * price rows and the platform keeps generating through whatever is left.
 *
 * Shape of the vendor API: one async submit (`/api/v1/jobs/createTask`) that
 * returns a task id, then a status poll (`/api/v1/jobs/recordInfo`) until the
 * task reports success or failure. Both endpoints wrap their payload in a
 * `{ code, msg, data }` envelope where `code === 200` means "accepted", NOT
 * "finished".
 *
 * Cost: Kie bills against a prepaid vendor balance and does not report a
 * per-task USD figure, and it does not charge for failed tasks. So this adapter
 * always returns `costTicks: null` — on success the ledger keeps our
 * server-side estimate, and on failure the caller refunds the reservation in
 * full.
 *
 * Config: `KIE_API_KEY` (required), `KIE_BASE_URL` (optional override).
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

export const KIE_PROVIDER_ID = "kie";

const DEFAULT_BASE_URL = "https://api.kie.ai";

/** Submit is cheap; the poll carries the long wait. */
const SUBMIT_TIMEOUT_MS = 20_000;
const SUBMIT_RETRIES = 2;
const PROBE_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 3_000;
/** Hard cap on how long one generation may stay in flight. */
const POLL_TOTAL_MS = 300_000;

type Envelope<T> = { code?: number; msg?: string; message?: string; data?: T };

type CreateTaskData = { taskId?: string; task_id?: string };

type RecordInfoData = {
  taskId?: string;
  state?: string;
  failMsg?: string;
  failCode?: string | number;
  resultJson?: string | { resultUrls?: unknown };
};

function baseUrl(): string {
  return normalizeBaseUrl(readEnv("KIE_BASE_URL") ?? DEFAULT_BASE_URL);
}

function authHeaders(key: string): Record<string, string> {
  return { authorization: `Bearer ${key}`, accept: "application/json" };
}

/** Pulls the first asset URL out of Kie's stringified `resultJson`. */
function firstResultUrl(data: RecordInfoData): string | null {
  const raw = data.resultJson;
  if (!raw) return null;
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const urls = (parsed as { resultUrls?: unknown })?.resultUrls;
  if (!Array.isArray(urls)) return null;
  const first = urls.find((u) => typeof u === "string" && u.length > 0);
  return typeof first === "string" ? first : null;
}

/**
 * Submits a task and polls it to completion. `input` is the vendor's own model
 * input object — the only vendor-shaped thing in this file.
 */
async function runTask(
  apiKey: string,
  model: string,
  input: Record<string, unknown>,
  signal: AbortSignal
): Promise<ProviderResult> {
  const submit = await requestJson<Envelope<CreateTaskData>>({
    method: "POST",
    url: `${baseUrl()}/api/v1/jobs/createTask`,
    headers: authHeaders(apiKey),
    body: { model, input },
    signal,
    timeoutMs: SUBMIT_TIMEOUT_MS,
    retries: SUBMIT_RETRIES,
  });
  if (!submit.ok) {
    return { ok: false, reason: submit.reason, retryable: submit.retryable };
  }
  if (submit.data.code !== undefined && submit.data.code !== 200) {
    return { ok: false, reason: `vendor_rejected_${submit.data.code}`, retryable: false };
  }

  const taskId = submit.data.data?.taskId ?? submit.data.data?.task_id;
  if (!taskId) {
    return { ok: false, reason: "missing_task_id", retryable: false };
  }

  const probe = async (probeSignal: AbortSignal): Promise<PollDecision<string>> => {
    const status = await requestJson<Envelope<RecordInfoData>>({
      method: "GET",
      url: `${baseUrl()}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      headers: authHeaders(apiKey),
      signal: probeSignal,
      timeoutMs: PROBE_TIMEOUT_MS,
      // A single flaky status read must not fail the job: stay pending and let
      // the loop's own budget decide when to give up.
      retries: 1,
    });
    if (!status.ok) {
      return status.retryable
        ? { state: "pending" }
        : { state: "failed", reason: status.reason, retryable: false };
    }

    const data = status.data.data ?? {};
    switch ((data.state ?? "").toLowerCase()) {
      case "success": {
        const url = firstResultUrl(data);
        return url
          ? { state: "done", value: url }
          : { state: "failed", reason: "missing_asset_url", retryable: true };
      }
      case "fail":
      case "failed":
        // Kie does not charge for a failed task, so the caller refunds in full.
        return { state: "failed", reason: "vendor_task_failed", retryable: true };
      default:
        return { state: "pending" };
    }
  };

  const result = await pollUntil<string>({
    probe,
    signal,
    totalMs: POLL_TOTAL_MS,
    intervalMs: POLL_INTERVAL_MS,
  });
  if (!result.ok) {
    return { ok: false, reason: result.reason, retryable: result.retryable };
  }

  return {
    ok: true,
    assetUrl: result.value,
    costTicks: null,
    providerRequestId: taskId,
  };
}

function missingKey(): ProviderResult {
  return { ok: false, reason: "provider_not_configured", retryable: false };
}

export const kieProvider: GenerationProvider = {
  id: KIE_PROVIDER_ID,

  isConfigured() {
    return readEnv("KIE_API_KEY") !== null;
  },

  async generateVideo(input: VideoJobInput, signal) {
    const apiKey = readEnv("KIE_API_KEY");
    if (!apiKey) return missingKey();

    return runTask(
      apiKey,
      input.modelId,
      {
        prompt: input.prompt,
        duration: input.durationSeconds,
        resolution: input.resolution,
        // `auto` means "let the model decide" — omit it rather than sending it.
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
    const apiKey = readEnv("KIE_API_KEY");
    if (!apiKey) return missingKey();

    return runTask(
      apiKey,
      input.modelId,
      {
        prompt: input.prompt,
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
