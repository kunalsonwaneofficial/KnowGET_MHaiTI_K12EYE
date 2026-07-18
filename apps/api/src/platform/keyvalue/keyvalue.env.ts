import { loadConfig } from "@knowget/configuration";
import { z } from "zod";

/**
 * Distributed-backend configuration. `REDIS_URL` selects the shared (Redis)
 * key-value backend for the rate limiter, cache and session read-through; unset
 * uses the in-memory per-instance default (dev / test / sandbox).
 * `SESSION_CACHE_TTL_MS` bounds how long a validated session is trusted on the
 * read-through fast path before it is re-checked.
 */
export const keyValueEnvSchema = z.object({
  REDIS_URL: z.string().min(1).optional(),
  SESSION_CACHE_TTL_MS: z.coerce.number().int().positive().default(5_000),
});

export type KeyValueEnv = z.infer<typeof keyValueEnvSchema>;

export function loadKeyValueEnv(source?: Record<string, unknown>): KeyValueEnv {
  return loadConfig(keyValueEnvSchema, source ? { source } : {});
}
