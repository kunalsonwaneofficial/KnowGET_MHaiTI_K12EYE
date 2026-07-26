import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import type { TenantId } from "@knowget/types";

/**
 * Permissions gating the alumni REST surface. Two scope pairs split the platform along its surface:
 * `alumni:*` covers the individual alumni-relationship surface — alumni profiles, mentorship connections,
 * contributions and the per-alumnus engagement profile; `community:*` covers the community/group surface —
 * chapters and their memberships, events and their registrations. The two are separately administered, so they
 * do not share a scope. Nothing is billed here — gift amounts are Finance's (P2-D14).
 */
export const ALUMNI_READ = "alumni:read";
export const ALUMNI_WRITE = "alumni:write";
export const COMMUNITY_READ = "community:read";
export const COMMUNITY_WRITE = "community:write";

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
