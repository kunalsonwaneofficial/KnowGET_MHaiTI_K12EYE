import type { RateLimitResult } from "@knowget/security";
import type { KeyValueStore } from "./key-value-store";

export interface RateLimitOptions {
  readonly windowMs: number;
  readonly max: number;
}

/**
 * Async, backend-agnostic rate limiter. Over the Redis {@link KeyValueStore} it is a
 * shared, cross-replica fixed-window limiter (resolving TD-17); over the in-memory
 * store it is per-instance (the Phase-1 behaviour). Replaces the synchronous,
 * in-memory frozen `RateLimiter` at the guard, which could not coordinate replicas.
 */
export interface AsyncRateLimiter {
  check(key: string, options: RateLimitOptions): Promise<RateLimitResult>;
}

const PREFIX = "rl:";

export class KeyValueRateLimiter implements AsyncRateLimiter {
  constructor(private readonly store: KeyValueStore) {}

  async check(key: string, options: RateLimitOptions): Promise<RateLimitResult> {
    // The window length is part of the counter key so limiters with different
    // windows (global vs a tightened per-route budget) never share a counter.
    const { count, resetAt } = await this.store.incrementWindow(
      `${PREFIX}${options.windowMs}:${key}`,
      options.windowMs,
    );
    return {
      allowed: count <= options.max,
      remaining: Math.max(0, options.max - count),
      resetAt,
    };
  }
}
