import type Redis from "ioredis";
import type { KeyValueStore, WindowCount } from "./key-value-store";

/**
 * Atomic fixed-window increment: `INCR`, set the window expiry only on the first
 * hit, then read the remaining TTL — all in one server-side script so concurrent
 * replicas can never race the expiry. Returns `{count, pttlMs}`.
 */
const WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return {count, redis.call('PTTL', KEYS[1])}
`;

/**
 * Redis-backed {@link KeyValueStore} (ioredis). Shared across replicas — the
 * adapter that makes the rate limiter, cache and session read-through
 * distributed. Constructed only when `REDIS_URL` is configured.
 */
export class RedisKeyValueStore implements KeyValueStore {
  constructor(private readonly redis: Redis) {}

  get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    if (ttlMs !== undefined) {
      await this.redis.set(key, value, "PX", ttlMs);
    } else {
      await this.redis.set(key, value);
    }
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    let cursor = "0";
    do {
      const [next, keys] = await this.redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 200);
      cursor = next;
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } while (cursor !== "0");
  }

  async incrementWindow(key: string, windowMs: number): Promise<WindowCount> {
    const [count, pttl] = (await this.redis.eval(WINDOW_SCRIPT, 1, key, windowMs)) as [
      number,
      number,
    ];
    return { count, resetAt: Date.now() + (pttl >= 0 ? pttl : windowMs) };
  }
}
