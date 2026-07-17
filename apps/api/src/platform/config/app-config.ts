import { loadConfig } from "@knowget/configuration";
import { z } from "zod";

/** Validated application configuration schema. */
export const appConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_HOST: z.string().min(1).default("0.0.0.0"),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

/** Load and validate application configuration (from env by default). */
export function loadAppConfig(source?: Record<string, unknown>): AppConfig {
  return loadConfig(appConfigSchema, source ? { source } : {});
}
