/** Result of an atomic fixed-window increment. */
export interface WindowCount {
  readonly count: number;
  readonly resetAt: number;
}

/**
 * The two clock-aligned bucket keys for a sliding-window counter at `now`: the
 * current window's bucket and the immediately-preceding one, whose tail overlaps
 * the trailing edge of the sliding window.
 */
export function slidingBucketKeys(
  key: string,
  now: number,
  windowMs: number,
): { readonly current: string; readonly previous: string } {
  const bucket = Math.floor(now / windowMs);
  return { current: `${key}:${bucket}`, previous: `${key}:${bucket - 1}` };
}

/**
 * Sliding-window-counter estimate: the current bucket's count plus the previous
 * bucket's count weighted by the fraction of the window still overlapped. Smooths
 * the fixed-window boundary burst without storing every request timestamp.
 */
export function slidingEstimate(
  now: number,
  windowMs: number,
  current: number,
  previous: number,
): WindowCount {
  const prevWeight = (windowMs - (now % windowMs)) / windowMs;
  return {
    count: previous * prevWeight + current,
    resetAt: (Math.floor(now / windowMs) + 1) * windowMs,
  };
}

/**
 * Backend-agnostic distributed key-value store. The in-memory default is
 * per-instance; a Redis-backed implementation makes it **shared across replicas**
 * — the seam that turns the rate limiter (TD-17), the shared cache (TD-19) and the
 * session read-through cache (TD-22) from per-instance into distributed, all
 * behind this one contract.
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
  /** Delete every key with the given prefix (namespaced cache clear). */
  deleteByPrefix(prefix: string): Promise<void>;
  /**
   * Atomically increment `key`'s counter, setting the window's expiry on the first
   * hit; returns the new count and when the window resets. The fixed-window
   * rate-limit primitive — atomic so concurrent replicas share one counter.
   */
  incrementWindow(key: string, windowMs: number): Promise<WindowCount>;
  /**
   * Record a hit in the current clock-aligned bucket and return the sliding-window
   * estimate (current bucket + weighted previous bucket). The sliding-window
   * rate-limit primitive — smoother than a fixed window at the boundary; atomic so
   * concurrent replicas share the counters.
   */
  slidingWindow(key: string, windowMs: number): Promise<WindowCount>;
}

interface Entry {
  readonly value: string;
  readonly expiresAt: number | null;
}

interface Counter {
  count: number;
  readonly resetAt: number;
}

/**
 * In-memory {@link KeyValueStore} — per-instance; the default when no `REDIS_URL`
 * is configured, and the substrate for in-sandbox unit tests. Injectable clock for
 * determinism; expiry is evaluated lazily on read.
 */
export class InMemoryKeyValueStore implements KeyValueStore {
  private readonly entries = new Map<string, Entry>();
  private readonly counters = new Map<string, Counter>();
  private readonly buckets = new Map<string, { count: number; expiresAt: number }>();

  constructor(private readonly clock: () => number = Date.now) {}

  async get(key: string): Promise<string | null> {
    const entry = this.entries.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt !== null && entry.expiresAt <= this.clock()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    this.entries.set(key, { value, expiresAt: ttlMs !== undefined ? this.clock() + ttlMs : null });
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    for (const key of [...this.entries.keys()]) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
      }
    }
  }

  async incrementWindow(key: string, windowMs: number): Promise<WindowCount> {
    const now = this.clock();
    const counter = this.counters.get(key);
    if (!counter || counter.resetAt <= now) {
      const resetAt = now + windowMs;
      this.counters.set(key, { count: 1, resetAt });
      return { count: 1, resetAt };
    }
    counter.count += 1;
    return { count: counter.count, resetAt: counter.resetAt };
  }

  async slidingWindow(key: string, windowMs: number): Promise<WindowCount> {
    const now = this.clock();
    const { current, previous } = slidingBucketKeys(key, now, windowMs);
    return slidingEstimate(
      now,
      windowMs,
      this.bumpBucket(current, now, windowMs),
      this.readBucket(previous, now),
    );
  }

  private bumpBucket(bucketKey: string, now: number, windowMs: number): number {
    const bucket = this.buckets.get(bucketKey);
    if (!bucket || bucket.expiresAt <= now) {
      // A bucket lives two windows so it is still readable as "previous" next window.
      this.buckets.set(bucketKey, { count: 1, expiresAt: now + 2 * windowMs });
      return 1;
    }
    bucket.count += 1;
    return bucket.count;
  }

  private readBucket(bucketKey: string, now: number): number {
    const bucket = this.buckets.get(bucketKey);
    return bucket && bucket.expiresAt > now ? bucket.count : 0;
  }
}
