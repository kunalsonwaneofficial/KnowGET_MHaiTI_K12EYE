import { ConfigurationError } from "@knowget/exceptions";
import type { z } from "zod";

export interface LoadConfigOptions {
  /** Raw key/value source to validate. Defaults to `process.env`. */
  readonly source?: Record<string, unknown>;
}

/**
 * Validate a raw source against a Zod schema and return a typed, frozen config.
 * Throws {@link ConfigurationError} on failure so misconfiguration fails fast at
 * bootstrap. Business logic depends on the typed result, never on `process.env`.
 */
export function loadConfig<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  options: LoadConfigOptions = {},
): z.infer<TSchema> {
  const source = options.source ?? process.env;
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    throw new ConfigurationError("Invalid configuration", { details: { issues } });
  }
  return Object.freeze(result.data);
}
