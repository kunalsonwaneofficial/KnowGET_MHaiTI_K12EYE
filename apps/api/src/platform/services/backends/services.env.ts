import { loadConfig } from "@knowget/configuration";
import { z } from "zod";

/**
 * Shared-services persistence backend. `persisted` routes the blob store and
 * full-text search to PostgreSQL (a shared, replica-agnostic backend — TD-19);
 * `memory` (default) keeps the in-memory implementations. Redis-backed jobs and
 * notifications are selected separately by `REDIS_URL`.
 */
export const servicesEnvSchema = z.object({
  SERVICES_STORE: z.enum(["memory", "persisted"]).default("memory"),
});

export type ServicesEnv = z.infer<typeof servicesEnvSchema>;

export function loadServicesEnv(source?: Record<string, unknown>): ServicesEnv {
  return loadConfig(servicesEnvSchema, source ? { source } : {});
}
