import { ValidationError } from "@knowget/exceptions";
import type { z } from "zod";

/**
 * Validate data at the persistence boundary against a Zod schema. Throws a
 * {@link ValidationError} (400, operational) with structured issue details on
 * failure so integrity is enforced before anything reaches the database.
 */
export function validateEntity<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  data: unknown,
): z.infer<TSchema> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    throw new ValidationError("Entity validation failed", { details: { issues } });
  }
  return result.data;
}
