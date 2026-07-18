import type { Cache, CacheSetOptions } from "@knowget/cache";
import type { KeyValueStore } from "./key-value-store";

const PREFIX = "cache:";

/**
 * {@link Cache} over a {@link KeyValueStore}. With the Redis store this is a shared,
 * cross-replica cache (TD-19); with the in-memory store it is per-instance. Values
 * are JSON-serialized under a `cache:` namespace; `getOrSet` has per-instance
 * single-flight (stampede protection within a process).
 */
export class KeyValueCache implements Cache {
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(private readonly store: KeyValueStore) {}

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.store.get(PREFIX + key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  }

  async set<T>(key: string, value: T, options?: CacheSetOptions): Promise<void> {
    await this.store.set(PREFIX + key, JSON.stringify(value), options?.ttlMs);
  }

  async has(key: string): Promise<boolean> {
    return (await this.store.get(PREFIX + key)) !== null;
  }

  async delete(key: string): Promise<boolean> {
    const existed = (await this.store.get(PREFIX + key)) !== null;
    await this.store.delete(PREFIX + key);
    return existed;
  }

  async clear(): Promise<void> {
    await this.store.deleteByPrefix(PREFIX);
  }

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T> | T,
    options?: CacheSetOptions,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) {
      return existing;
    }
    const promise = (async (): Promise<T> => {
      const value = await factory();
      await this.set(key, value, options);
      return value;
    })();
    this.inflight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inflight.delete(key);
    }
  }
}
