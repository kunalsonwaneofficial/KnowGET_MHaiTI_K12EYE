import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import type { TenantId } from "@knowget/types";

/**
 * Permissions gating the academic-scheduling REST surface. Scheduling is operational
 * structure, not sensitive personal data, so a single read/write scope pair covers the whole
 * platform — timetables, slots, resources, allocations, policies and substitutions.
 */
export const SCHEDULING_READ = "scheduling:read";
export const SCHEDULING_WRITE = "scheduling:write";

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
