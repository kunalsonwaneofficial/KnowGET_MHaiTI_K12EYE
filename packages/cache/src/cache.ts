/** Options for writing a cache entry. */
export interface CacheSetOptions {
  /** Time-to-live in milliseconds; omitted uses the cache default (if any). */
  readonly ttlMs?: number;
}

/**
 * Provider-agnostic cache contract. The Phase-1 default is an in-memory
 * implementation; a distributed cache (e.g. Redis) can replace it behind this
 * same async contract without changing callers.
 */
export interface Cache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, options?: CacheSetOptions): Promise<void>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
  /**
   * Return the cached value, or compute it with `factory`, store it and return
   * it. Concurrent callers for the same missing key share one in-flight factory
   * call (stampede protection).
   */
  getOrSet<T>(key: string, factory: () => Promise<T> | T, options?: CacheSetOptions): Promise<T>;
}
