import { beforeEach, describe, expect, it } from "vitest";
import { KeyValueCache } from "./key-value-cache";
import { InMemoryKeyValueStore } from "./key-value-store";

let clock: number;
let cache: KeyValueCache;

beforeEach(() => {
  clock = 1000;
  cache = new KeyValueCache(new InMemoryKeyValueStore(() => clock));
});

describe("KeyValueCache", () => {
  it("sets, gets, has and deletes typed values", async () => {
    await cache.set("k", { a: 1 });
    expect(await cache.get<{ a: number }>("k")).toEqual({ a: 1 });
    expect(await cache.has("k")).toBe(true);
    expect(await cache.delete("k")).toBe(true);
    expect(await cache.get("k")).toBeUndefined();
    expect(await cache.delete("k")).toBe(false); // already gone
  });

  it("honours TTL", async () => {
    await cache.set("k", "v", { ttlMs: 100 });
    expect(await cache.get("k")).toBe("v");
    clock += 101;
    expect(await cache.get("k")).toBeUndefined();
  });

  it("getOrSet computes once and caches", async () => {
    let calls = 0;
    const factory = async (): Promise<string> => {
      calls += 1;
      return "computed";
    };
    expect(await cache.getOrSet("k", factory)).toBe("computed");
    expect(await cache.getOrSet("k", factory)).toBe("computed");
    expect(calls).toBe(1);
  });

  it("getOrSet shares one in-flight computation (single-flight)", async () => {
    let calls = 0;
    const factory = async (): Promise<string> => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 10));
      return "v";
    };
    const [a, b] = await Promise.all([cache.getOrSet("k", factory), cache.getOrSet("k", factory)]);
    expect(a).toBe("v");
    expect(b).toBe("v");
    expect(calls).toBe(1);
  });

  it("clear removes namespaced entries", async () => {
    await cache.set("a", 1);
    await cache.set("b", 2);
    await cache.clear();
    expect(await cache.get("a")).toBeUndefined();
    expect(await cache.get("b")).toBeUndefined();
  });
});
