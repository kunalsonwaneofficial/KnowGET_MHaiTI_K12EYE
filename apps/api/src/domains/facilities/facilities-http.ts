import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import type { TenantId } from "@knowget/types";

/**
 * Permissions gating the facilities REST surface. Two scope pairs split the platform along its physical
 * boundary: `facilities:*` covers the immovable built environment and its operational work — buildings,
 * spaces, fixed systems, maintenance work orders and the per-building condition profile — held by facilities
 * management; `environment:*` covers the smart-environment side — sensors, their telemetry readings, comfort
 * policies and the live comfort assessment — administered by the building-management-systems / IoT function.
 * The two are separately administered, so they do not share a scope. Nothing is billed here: asset value and
 * costed maintenance are Procurement & Assets' (P2-D15) and utility billing is Finance's (P2-D14); neither is
 * gated.
 */
export const FACILITIES_READ = "facilities:read";
export const FACILITIES_WRITE = "facilities:write";
export const ENVIRONMENT_READ = "environment:read";
export const ENVIRONMENT_WRITE = "environment:write";

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
