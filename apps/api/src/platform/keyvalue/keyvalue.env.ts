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
  /**
   * Rate-limit algorithm: `fixed` (default) is a fixed-window counter; `sliding`
   * weights the previous window to smooth the boundary burst. Both are shared across
   * replicas over Redis; the choice is independent of the backend.
   */
  RATE_LIMIT_STRATEGY: z.enum(["fixed", "sliding"]).default("fixed"),
});

export type KeyValueEnv = z.infer<typeof keyValueEnvSchema>;

export function loadKeyValueEnv(source?: Record<string, unknown>): KeyValueEnv {
  return loadConfig(keyValueEnvSchema, source ? { source } : {});
}
