import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import type { TenantId } from "@knowget/types";

/**
 * Permissions gating the residential REST surface. Two scope pairs split the platform along its
 * operational boundary: `hostel:*` covers the physical residential plant and the people and compliance
 * behind it (hostels, wardens, rooms, statutory inspections), held by the estates/warden team;
 * `boarding:*` covers the boarding operations (bed allocations, outpasses, curfew roll calls and
 * occupancy), held by the boarding-operations team. The two are separately administered, so they do not
 * share a scope.
 */
export const HOSTEL_READ = "hostel:read";
export const HOSTEL_WRITE = "hostel:write";
export const BOARDING_READ = "boarding:read";
export const BOARDING_WRITE = "boarding:write";

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
