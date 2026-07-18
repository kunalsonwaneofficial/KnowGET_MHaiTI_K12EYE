import Redis from "ioredis";
import { Global, Inject, Module, type OnModuleDestroy, type Provider } from "@nestjs/common";
import { KeyValueRateLimiter } from "./async-rate-limiter";
import { KeyValueCache } from "./key-value-cache";
import { InMemoryKeyValueStore, type KeyValueStore } from "./key-value-store";
import { loadKeyValueEnv } from "./keyvalue.env";
import {
  ASYNC_RATE_LIMITER,
  KEY_VALUE_STORE,
  REDIS_CLIENT,
  SESSION_VALIDITY_CACHE,
} from "./keyvalue.tokens";
import { RedisKeyValueStore } from "./redis-key-value.store";
import { SessionValidityCache } from "./session-cache";

const providers: Provider[] = [
  {
    // The Redis connection when `REDIS_URL` is set, else null (in-memory backend).
    provide: REDIS_CLIENT,
    useFactory: (): Redis | null => {
      const { REDIS_URL } = loadKeyValueEnv();
      return REDIS_URL ? new Redis(REDIS_URL) : null;
    },
  },
  {
    provide: KEY_VALUE_STORE,
    useFactory: (redis: Redis | null): KeyValueStore =>
      redis ? new RedisKeyValueStore(redis) : new InMemoryKeyValueStore(),
    inject: [REDIS_CLIENT],
  },
  {
    provide: ASYNC_RATE_LIMITER,
    useFactory: (store: KeyValueStore) => new KeyValueRateLimiter(store),
    inject: [KEY_VALUE_STORE],
  },
  {
    provide: SESSION_VALIDITY_CACHE,
    useFactory: (store: KeyValueStore) =>
      new SessionValidityCache(new KeyValueCache(store), loadKeyValueEnv().SESSION_CACHE_TTL_MS),
    inject: [KEY_VALUE_STORE],
  },
];

/**
 * Distributed backend (TD-17/19/22). Provides the shared key-value store — Redis
 * when `REDIS_URL` is set, in-memory otherwise — and the surfaces built on it: the
 * async rate limiter (used by the guard), the session read-through cache (used by
 * the enforcer), and the store the shared `Cache` uses. Global so the security and
 * services modules inject these without re-importing. Closes Redis on shutdown.
 */
@Global()
@Module({
  providers,
  exports: [KEY_VALUE_STORE, ASYNC_RATE_LIMITER, SESSION_VALIDITY_CACHE, REDIS_CLIENT],
})
export class KeyValueModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis | null) {}

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}
