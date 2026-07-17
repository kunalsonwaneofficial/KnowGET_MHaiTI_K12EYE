import type { Cache, CacheSetOptions } from "./cache";

/**
 * Wraps a {@link Cache} so all keys are transparently prefixed with a namespace.
 * Lets many features (or tenants) share one backing cache without key
 * collisions. Delegates every operation to the inner cache.
 */
export class NamespacedCache implements Cache {
  private readonly prefix: string;

  constructor(
    private readonly inner: Cache,
    namespace: string,
    separator = ":",
  ) {
    this.prefix = `${namespace}${separator}`;
  }

  private scope(key: string): string {
    return `${this.prefix}${key}`;
  }

  get<T>(key: string): Promise<T | undefined> {
    return this.inner.get<T>(this.scope(key));
  }

  set<T>(key: string, value: T, options?: CacheSetOptions): Promise<void> {
    return this.inner.set(this.scope(key), value, options);
  }

  has(key: string): Promise<boolean> {
    return this.inner.has(this.scope(key));
  }

  delete(key: string): Promise<boolean> {
    return this.inner.delete(this.scope(key));
  }

  clear(): Promise<void> {
    // A shared backing store cannot be safely cleared from a namespace view.
    return Promise.reject(
      new Error("NamespacedCache.clear() is unsupported; clear the backing cache directly"),
    );
  }

  getOrSet<T>(key: string, factory: () => Promise<T> | T, options?: CacheSetOptions): Promise<T> {
    return this.inner.getOrSet(this.scope(key), factory, options);
  }
}
