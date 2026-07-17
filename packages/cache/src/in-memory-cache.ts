import type { Cache, CacheSetOptions } from "./cache";

interface Entry {
  readonly value: unknown;
  /** Epoch ms at which the entry expires, or null for no expiry. */
  readonly expiresAt: number | null;
}

export interface InMemoryCacheOptions {
  /** Maximum number of live entries; least-recently-used are evicted first. */
  readonly maxEntries?: number;
  /** Default TTL (ms) applied when a `set` omits one. */
  readonly defaultTtlMs?: number;
  /** Clock injection point for deterministic tests. */
  readonly clock?: () => number;
}

/**
 * In-memory cache with per-entry TTL and LRU eviction. Backed by an
 * insertion-ordered `Map`: reads promote the key to most-recently-used, and
 * once `maxEntries` is exceeded the least-recently-used key is evicted. Expired
 * entries are treated as absent and removed lazily on access.
 */
export class InMemoryCache implements Cache {
  private readonly store = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly maxEntries: number | null;
  private readonly defaultTtlMs: number | null;
  private readonly clock: () => number;

  constructor(options: InMemoryCacheOptions = {}) {
    this.maxEntries =
      options.maxEntries !== undefined && options.maxEntries > 0 ? options.maxEntries : null;
    this.defaultTtlMs = options.defaultTtlMs ?? null;
    this.clock = options.clock ?? Date.now;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }
    if (this.isExpired(entry)) {
      this.store.delete(key);
      return undefined;
    }
    // Promote to most-recently-used.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value as T;
  }

  async set<T>(key: string, value: T, options: CacheSetOptions = {}): Promise<void> {
    const ttlMs = options.ttlMs ?? this.defaultTtlMs;
    const expiresAt = ttlMs !== null && ttlMs !== undefined ? this.clock() + ttlMs : null;
    // Re-insert at the tail (most-recently-used).
    this.store.delete(key);
    this.store.set(key, { value, expiresAt });
    this.evictIfNeeded();
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== undefined;
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T> | T,
    options: CacheSetOptions = {},
  ): Promise<T> {
    const existing = await this.get<T>(key);
    if (existing !== undefined) {
      return existing;
    }
    const pending = this.inflight.get(key);
    if (pending) {
      return pending as Promise<T>;
    }
    const promise = (async () => {
      try {
        const value = await factory();
        await this.set(key, value, options);
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, promise);
    return promise;
  }

  /** Current number of stored entries (including not-yet-reaped expired ones). */
  get size(): number {
    return this.store.size;
  }

  private isExpired(entry: Entry): boolean {
    return entry.expiresAt !== null && entry.expiresAt <= this.clock();
  }

  private evictIfNeeded(): void {
    if (this.maxEntries === null) {
      return;
    }
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.store.delete(oldest);
    }
  }
}
