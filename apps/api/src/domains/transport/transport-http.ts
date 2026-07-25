import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import type { TenantId } from "@knowget/types";

/**
 * Permissions gating the transport REST surface. Two scope pairs split the platform along its
 * operational boundary: `fleet:*` covers the physical fleet and the people and compliance behind it
 * (vehicles, drivers, statutory documents), held by the transport/workshop team; `transport:*` covers
 * the operations (routes, vehicle assignments, student subscriptions, trips and route utilization), held
 * by the transport-operations/routing team. The two are separately administered, so they do not share a
 * scope.
 */
export const FLEET_READ = "fleet:read";
export const FLEET_WRITE = "fleet:write";
export const TRANSPORT_READ = "transport:read";
export const TRANSPORT_WRITE = "transport:write";

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
