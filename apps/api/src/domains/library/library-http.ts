import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import type { TenantId } from "@knowget/types";

/**
 * Permissions gating the library REST surface. Two scope pairs split the platform along its operational
 * boundary: `library:*` covers the knowledge collection itself — what the library holds and describes
 * (catalog titles, physical copies, digital learning assets and the collection profile) — held by the
 * cataloguing/collection team; `circulation:*` covers the lending relationship — who may borrow and the
 * rules that govern it (members, loans, reservations and the circulation policy) — held by the
 * circulation desk. The two are separately administered, so they do not share a scope. Overdue/lost fines
 * belong to Finance (P2-D14) and acquisition spend to Procurement/Assets (P2-D15); neither is gated here.
 */
export const LIBRARY_READ = "library:read";
export const LIBRARY_WRITE = "library:write";
export const CIRCULATION_READ = "circulation:read";
export const CIRCULATION_WRITE = "circulation:write";

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
