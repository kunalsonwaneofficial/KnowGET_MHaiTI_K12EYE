import Redis from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RedisKeyValueStore } from "./redis-key-value.store";

// Runs when REDIS_URL is set — in CI (the `redis` service) and in local/sandbox
// verification against a running redis-server. Skipped otherwise.
const url = process.env.REDIS_URL;

describe.skipIf(!url)("RedisKeyValueStore (integration)", () => {
  let redis: Redis;
  let store: RedisKeyValueStore;
  const ns = `itest:${process.pid}:`;

  beforeAll(() => {
    redis = new Redis(url as string);
    store = new RedisKeyValueStore(redis);
  });

  afterAll(async () => {
    const keys = await redis.keys(`${ns}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    await redis.quit();
  });

  it("sets, gets and deletes a value (with TTL)", async () => {
    await store.set(`${ns}k`, "v", 2000);
    expect(await store.get(`${ns}k`)).toBe("v");
    await store.delete(`${ns}k`);
    expect(await store.get(`${ns}k`)).toBeNull();
  });

  it("expires a value after its TTL", async () => {
    await store.set(`${ns}exp`, "v", 150);
    await new Promise((r) => setTimeout(r, 250));
    expect(await store.get(`${ns}exp`)).toBeNull();
  });

  it("shares an atomic window counter across store instances (distribution)", async () => {
    const key = `${ns}w`;
    // A second store on the same Redis stands in for another replica.
    const replica = new RedisKeyValueStore(redis);
    expect((await store.incrementWindow(key, 5000)).count).toBe(1);
    expect((await replica.incrementWindow(key, 5000)).count).toBe(2);
    expect((await store.incrementWindow(key, 5000)).count).toBe(3);
  });

  it("shares a sliding-window counter across store instances", async () => {
    const key = `${ns}sw`;
    const replica = new RedisKeyValueStore(redis);
    // A one-hour window so all three hits land in the same clock-aligned bucket; the
    // previous bucket is empty, so the estimate is the raw shared count 1, 2, 3.
    const windowMs = 3_600_000;
    expect((await store.slidingWindow(key, windowMs)).count).toBe(1);
    expect((await replica.slidingWindow(key, windowMs)).count).toBe(2);
    expect((await store.slidingWindow(key, windowMs)).count).toBe(3);
  });
});
