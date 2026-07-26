import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import type { TenantId } from "@knowget/types";

/**
 * Permissions gating the campus-security REST surface. Two scope pairs split the platform along its
 * operational boundary: `security:*` covers the security-operations centre — access zones, credentials, the
 * access-decision + immutable door log, security incidents, emergency drills and the per-zone safety profile;
 * `visitor:*` covers the front-desk visitor management — visitors and their visits. The two are separately
 * administered, so they do not share a scope. Nothing is billed here (security-service billing/procurement is
 * Finance's P2-D14 / Procurement & Assets' P2-D15); neither is gated. The standing safeguarding record is
 * Learner Wellbeing's (P2-D05) and clinical incidents are the Health Centre's (P2-D19) — distinct scopes in
 * distinct domains.
 */
export const SECURITY_READ = "security:read";
export const SECURITY_WRITE = "security:write";
export const VISITOR_READ = "visitor:read";
export const VISITOR_WRITE = "visitor:write";

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
