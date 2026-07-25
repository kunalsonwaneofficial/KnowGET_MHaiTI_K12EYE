import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import type { TenantId } from "@knowget/types";

/**
 * Permissions gating the resource REST surface. Two scope pairs split the platform along its real
 * operational boundary: `procurement:*` covers the buy-and-hold flow (suppliers, inventory items, the
 * stock ledger, requisitions, purchase orders and inventory positions), held by the stores/purchasing
 * team; `asset:*` covers the fixed-asset register and its maintenance, held by the asset/facilities
 * team. The two are separately administered, so they never share a scope.
 */
export const PROCUREMENT_READ = "procurement:read";
export const PROCUREMENT_WRITE = "procurement:write";
export const ASSET_READ = "asset:read";
export const ASSET_WRITE = "asset:write";

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
