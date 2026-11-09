/**
 * Bounded in-process fixed-window rate limiter.
 *
 * Uploads write to disk, so one account must not be able to fill it. This is
 * deliberately the simplest thing that cannot leak memory: a Map capped at
 * `MAX_TRACKED` keys, pruned of expired windows before it grows, and when it
 * is still full the entry whose window ends soonest is evicted.
 *
 * It is per-process, so with N app instances the effective limit is N x the
 * configured one. That is fine for a disk guard — when this moves behind a
 * bucket the counter should move to Redis, which is why the call site only
 * sees `consume()`.
 *
 * Server-only. Never logs a user id.
 */

type Window = { count: number; resetAt: number };

export type RateLimitDecision =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

export type RateLimitOptions = {
  /** Length of one window. */
  windowMs: number;
  /** Permitted calls per window. */
  max: number;
  /** Hard ceiling on tracked keys, so the map cannot grow without bound. */
  maxTracked?: number;
};

const DEFAULT_MAX_TRACKED = 10_000;

export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, Window>();
  private readonly options: RateLimitOptions;

  constructor(options: RateLimitOptions) {
    this.options = options;
  }

  /** Records one call and says whether it is allowed. */
  consume(key: string, now: number = Date.now()): RateLimitDecision {
    const existing = this.windows.get(key);

    if (!existing || existing.resetAt <= now) {
      this.makeRoom(now);
      this.windows.set(key, {
        count: 1,
        resetAt: now + this.options.windowMs,
      });
      return { allowed: true, remaining: this.options.max - 1 };
    }

    if (existing.count >= this.options.max) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((existing.resetAt - now) / 1000)
        ),
      };
    }

    existing.count += 1;
    return { allowed: true, remaining: this.options.max - existing.count };
  }

  /** Drops expired windows, then evicts the soonest-expiring one if still full. */
  private makeRoom(now: number): void {
    const ceiling = this.options.maxTracked ?? DEFAULT_MAX_TRACKED;
    if (this.windows.size < ceiling) return;

    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
    if (this.windows.size < ceiling) return;

    let oldestKey: string | null = null;
    let oldestReset = Number.POSITIVE_INFINITY;
    for (const [key, window] of this.windows) {
      if (window.resetAt < oldestReset) {
        oldestReset = window.resetAt;
        oldestKey = key;
      }
    }
    if (oldestKey !== null) this.windows.delete(oldestKey);
  }
}
