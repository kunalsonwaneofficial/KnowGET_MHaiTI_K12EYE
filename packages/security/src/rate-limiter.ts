export interface RateLimiterOptions {
  readonly windowMs: number;
  readonly max: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAt: number;
}

/**
 * In-memory fixed-window rate limiter. Reusable across transports (HTTP,
 * background jobs); a distributed (Redis-backed) limiter can replace it behind
 * the same `check` contract.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly options: RateLimiterOptions,
    private readonly clock: () => number = Date.now,
  ) {}

  /** The maximum number of hits allowed per window (for `X-RateLimit-Limit`). */
  get limit(): number {
    return this.options.max;
  }

  /** The window length in milliseconds. */
  get windowMs(): number {
    return this.options.windowMs;
  }

  check(key: string): RateLimitResult {
    const now = this.clock();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      const resetAt = now + this.options.windowMs;
      this.hits.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: this.options.max - 1, resetAt };
    }
    entry.count += 1;
    return {
      allowed: entry.count <= this.options.max,
      remaining: Math.max(0, this.options.max - entry.count),
      resetAt: entry.resetAt,
    };
  }
}
