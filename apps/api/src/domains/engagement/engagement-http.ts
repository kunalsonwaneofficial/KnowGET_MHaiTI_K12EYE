import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import type { TenantId } from "@knowget/types";

/**
 * Permissions gating the engagement REST surface. Two scope pairs split the platform along its surface:
 * `communication:*` covers the outbound + two-way messaging surface — audiences, announcements and their
 * acknowledgement receipts, message threads and their messages; `engagement:*` covers the feedback + analytics
 * surface — surveys, their responses and the per-audience engagement profile. The two are separately
 * administered, so they do not share a scope. Nothing is billed here. Channel delivery is the platform
 * notifications service's (P1-M05) and contact preferences are Family & Guardian's (P2-D04) — distinct
 * concerns in distinct domains.
 */
export const COMMUNICATION_READ = "communication:read";
export const COMMUNICATION_WRITE = "communication:write";
export const ENGAGEMENT_READ = "engagement:read";
export const ENGAGEMENT_WRITE = "engagement:write";

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
