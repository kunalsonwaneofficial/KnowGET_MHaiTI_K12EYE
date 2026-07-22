import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import type { TenantId } from "@knowget/types";

/**
 * Fine-grained permissions gating the learner-wellbeing REST surface. Each sensitive
 * area carries its own read/write scope so health, counselling and safeguarding data can
 * be authorized independently of one another and of general wellbeing — the core
 * privacy requirement of P2-D05. Safeguarding is the most restricted; counselling is
 * isolated with enhanced privacy; health is protected.
 */
export const WELLBEING_READ = "wellbeing:read";
export const WELLBEING_WRITE = "wellbeing:write";
export const HEALTH_READ = "health:read";
export const HEALTH_WRITE = "health:write";
export const BEHAVIOUR_READ = "behaviour:read";
export const BEHAVIOUR_WRITE = "behaviour:write";
export const COUNSELLING_READ = "counselling:read";
export const COUNSELLING_WRITE = "counselling:write";
export const SAFEGUARDING_READ = "safeguarding:read";
export const SAFEGUARDING_WRITE = "safeguarding:write";
export const SUPPORT_READ = "support:read";
export const SUPPORT_WRITE = "support:write";
export const INTERVENTION_READ = "intervention:read";
export const INTERVENTION_WRITE = "intervention:write";

interface ZodLike<T> {
  safeParse: (
    value: unknown,
  ) => { success: true; data: T } | { success: false; error: { issues: unknown } };
}

/** Parse a request body with a zod schema, mapping failure to a 400 ValidationError. */
export function parseBody<T>(schema: ZodLike<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError("Invalid request body", { details: { issues: result.error.issues } });
  }
  return result.data;
}

/** The tenant of the current principal, or a 400 when none is associated. */
export function tenantOf(principal: Principal): TenantId {
  if (!principal.tenantId) {
    throw new ValidationError("No tenant is associated with the current principal");
  }
  return principal.tenantId;
}
