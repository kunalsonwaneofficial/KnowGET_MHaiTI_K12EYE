/** Result of an atomic fixed-window increment. */
export interface WindowCount {
  readonly count: number;
  readonly resetAt: number;
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
}
