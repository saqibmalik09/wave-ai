/**
 * Shared outbound transport for provider adapters.
 *
 * Every vendor call on the money path needs the same four guarantees, so they
 * live here once instead of being re-implemented (and subtly broken) per
 * adapter: a hard per-attempt timeout, bounded retries with exponential
 * backoff + jitter, a cap on the total time a poll loop may burn, and
 * cancellation that propagates from the route's own deadline.
 *
 * Failures come back as values, never exceptions, so an adapter can map them to
 * `ProviderResult` and the registry can move to the next provider.
 *
 * Logging policy: this module logs NOTHING. Request bodies contain prompts and
 * headers contain API keys.
 *
 * Server-only.
 */

/** Hard ceiling on a response body we are willing to buffer (1 MiB). */
const MAX_RESPONSE_BYTES = 1_048_576;

export type HttpOutcome<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; reason: string; retryable: boolean; status: number | null };

export type RequestOptions = {
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  /** Serialised as JSON when present. */
  body?: unknown;
  /** The caller's deadline. Aborting it stops retries immediately. */
  signal: AbortSignal;
  /** Per-attempt timeout. */
  timeoutMs: number;
  /** Extra attempts after the first. 0 = a single attempt. */
  retries: number;
  /** Base backoff; attempt n waits backoffMs * 2^n plus jitter. */
  backoffMs?: number;
};

/**
 * Chains the caller's signal with a fresh per-attempt timeout. Returns a
 * disposer so neither the timer nor the listener outlives the attempt.
 */
export function linkedSignal(outer: AbortSignal, timeoutMs: number) {
  const controller = new AbortController();
  const onOuterAbort = () => controller.abort(outer.reason);
  if (outer.aborted) {
    controller.abort(outer.reason);
  } else {
    outer.addEventListener("abort", onOuterAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      outer.removeEventListener("abort", onOuterAbort);
    },
  };
}

/** Abortable sleep. Resolves early (without throwing) when the signal fires. */
export function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** 5xx / 408 / 429 are worth another attempt; other 4xx are our own fault. */
function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

/**
 * One JSON request with timeout + bounded retries. `T` is unvalidated vendor
 * JSON — adapters must narrow it before use.
 */
export async function requestJson<T>(
  options: RequestOptions
): Promise<HttpOutcome<T>> {
  const attempts = Math.max(0, options.retries) + 1;
  const backoffMs = options.backoffMs ?? 400;
  let last: HttpOutcome<T> = {
    ok: false,
    reason: "no_attempt",
    retryable: false,
    status: null,
  };

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (options.signal.aborted) {
      return { ok: false, reason: "canceled", retryable: false, status: null };
    }
    last = await attemptJson<T>(options);
    if (last.ok || !last.retryable) return last;

    const isLast = attempt === attempts - 1;
    if (isLast) break;
    // Exponential backoff with jitter so a vendor blip does not turn into a
    // synchronised retry storm from every instance.
    const wait = backoffMs * 2 ** attempt + Math.floor(Math.random() * backoffMs);
    await delay(wait, options.signal);
  }
  return last;
}

async function attemptJson<T>(
  options: RequestOptions
): Promise<HttpOutcome<T>> {
  const link = linkedSignal(options.signal, options.timeoutMs);
  try {
    const response = await fetch(options.url, {
      method: options.method,
      headers:
        options.body === undefined
          ? options.headers
          : { ...options.headers, "content-type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: link.signal,
      cache: "no-store",
    });

    const declared = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
      return {
        ok: false,
        reason: "response_too_large",
        retryable: false,
        status: response.status,
      };
    }

    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      return {
        ok: false,
        reason: "response_too_large",
        retryable: false,
        status: response.status,
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        reason: `vendor_http_${response.status}`,
        retryable: isRetryableStatus(response.status),
        status: response.status,
      };
    }

    try {
      return { ok: true, status: response.status, data: JSON.parse(text) as T };
    } catch {
      return {
        ok: false,
        reason: "invalid_json",
        retryable: false,
        status: response.status,
      };
    }
  } catch {
    // fetch rejects for aborts (caller cancel OR our timeout) and for network
    // errors. Both are worth one more try unless the caller gave up.
    if (options.signal.aborted) {
      return { ok: false, reason: "canceled", retryable: false, status: null };
    }
    return { ok: false, reason: "network_error", retryable: true, status: null };
  }
}

export type PollDecision<R> =
  | { state: "pending" }
  | { state: "done"; value: R }
  | { state: "failed"; reason: string; retryable: boolean };

export type PollOptions<R> = {
  /** Runs one status check. Return `pending` to be called again. */
  probe: (signal: AbortSignal) => Promise<PollDecision<R>>;
  signal: AbortSignal;
  /** Total wall-clock budget for the whole loop. */
  totalMs: number;
  intervalMs: number;
};

/**
 * Polls until the job finishes, fails, the caller cancels, or the total budget
 * runs out. Bounded by construction — a stuck vendor can never hold a request
 * (or a RESERVED ledger row) open indefinitely.
 */
export async function pollUntil<R>(
  options: PollOptions<R>
): Promise<{ ok: true; value: R } | { ok: false; reason: string; retryable: boolean }> {
  const deadline = Date.now() + options.totalMs;
  while (Date.now() < deadline) {
    if (options.signal.aborted) {
      return { ok: false, reason: "canceled", retryable: false };
    }
    const decision = await options.probe(options.signal);
    if (decision.state === "done") return { ok: true, value: decision.value };
    if (decision.state === "failed") {
      return { ok: false, reason: decision.reason, retryable: decision.retryable };
    }
    await delay(options.intervalMs, options.signal);
  }
  return { ok: false, reason: "poll_timeout", retryable: true };
}

/** Reads a required secret without ever echoing its value. */
export function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

/** Trims a trailing slash so adapters can concatenate paths safely. */
export function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}
