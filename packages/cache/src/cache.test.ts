import { describe, expect, it } from "vitest";
import { InMemoryCache } from "./in-memory-cache";
import { NamespacedCache } from "./namespaced-cache";

describe("InMemoryCache", () => {
  it("stores and retrieves values", async () => {
    const cache = new InMemoryCache();
    await cache.set("a", 1);
    expect(await cache.get<number>("a")).toBe(1);
    expect(await cache.has("a")).toBe(true);
    expect(await cache.get("missing")).toBeUndefined();
  });

  it("expires entries after their TTL", async () => {
    let now = 0;
    const cache = new InMemoryCache({ clock: () => now });
    await cache.set("k", "v", { ttlMs: 1000 });
    expect(await cache.get("k")).toBe("v");
    now = 1000;
    expect(await cache.get("k")).toBeUndefined();
    expect(await cache.has("k")).toBe(false);
  });

  it("applies the default TTL when none is given", async () => {
    let now = 0;
    const cache = new InMemoryCache({ defaultTtlMs: 500, clock: () => now });
    await cache.set("k", "v");
    now = 500;
    expect(await cache.get("k")).toBeUndefined();
  });

  it("evicts least-recently-used entries beyond maxEntries", async () => {
    const cache = new InMemoryCache({ maxEntries: 2 });
    await cache.set("a", 1);
    await cache.set("b", 2);
    // Touch "a" so "b" becomes least-recently-used.
    await cache.get("a");
    await cache.set("c", 3);
    expect(await cache.get("b")).toBeUndefined();
    expect(await cache.get("a")).toBe(1);
    expect(await cache.get("c")).toBe(3);
    expect(cache.size).toBe(2);
  });

  it("getOrSet computes once and caches", async () => {
    const cache = new InMemoryCache();
    let calls = 0;
    const factory = async (): Promise<number> => {
      calls += 1;
      return 42;
    };
    expect(await cache.getOrSet("k", factory)).toBe(42);
    expect(await cache.getOrSet("k", factory)).toBe(42);
    expect(calls).toBe(1);
  });

  it("getOrSet shares one in-flight computation for concurrent callers", async () => {
    const cache = new InMemoryCache();
    let calls = 0;
    const factory = (): Promise<number> =>
      new Promise((resolve) => {
        calls += 1;
        setTimeout(() => resolve(7), 5);
      });
    const [a, b] = await Promise.all([cache.getOrSet("k", factory), cache.getOrSet("k", factory)]);
    expect(a).toBe(7);
    expect(b).toBe(7);
    expect(calls).toBe(1);
  });

  it("deletes and clears", async () => {
    const cache = new InMemoryCache();
    await cache.set("a", 1);
    expect(await cache.delete("a")).toBe(true);
    expect(await cache.delete("a")).toBe(false);
    await cache.set("b", 2);
    await cache.clear();
    expect(await cache.get("b")).toBeUndefined();
  });
});

describe("NamespacedCache", () => {
  it("isolates keys by namespace over one backing cache", async () => {
    const backing = new InMemoryCache();
    const a = new NamespacedCache(backing, "a");
    const b = new NamespacedCache(backing, "b");
    await a.set("k", "from-a");
    await b.set("k", "from-b");
    expect(await a.get("k")).toBe("from-a");
    expect(await b.get("k")).toBe("from-b");
  });

  it("refuses clear() on a shared backing store", async () => {
    const cache = new NamespacedCache(new InMemoryCache(), "ns");
    await expect(cache.clear()).rejects.toThrow();
  });
});
