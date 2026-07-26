import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import type { TenantId } from "@knowget/types";

/**
 * Permissions gating the admissions REST surface. Two scope pairs split the platform along its surface:
 * `marketing:*` covers the top-of-funnel growth surface — marketing campaigns and the leads they draw;
 * `admissions:*` covers the admissions process surface — admission cycles and their seat plans, applications
 * and their entrance evaluations, offers, enrollment confirmations and the per-cycle funnel profile. The two
 * are separately administered, so they do not share a scope. Nothing is billed here — application and
 * admission fees are Finance's (P2-D14).
 */
export const MARKETING_READ = "marketing:read";
export const MARKETING_WRITE = "marketing:write";
export const ADMISSIONS_READ = "admissions:read";
export const ADMISSIONS_WRITE = "admissions:write";

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
