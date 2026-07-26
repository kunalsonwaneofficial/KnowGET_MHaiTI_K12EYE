import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import type { TenantId } from "@knowget/types";

/**
 * Permissions gating the health-centre REST surface. Two scope pairs split the platform along its
 * operational boundary: `clinic:*` covers the clinical estate and its people and oversight (health centres,
 * clinicians, the descriptive centre profile), held by health-centre administration; `clinical:*` covers
 * the patient-facing care operations (appointments, encounters, prescriptions, sick-bay admissions,
 * referrals), delivered by clinical staff. The two are separately administered, so they do not share a
 * scope. Clinical services are not billed here (Finance, P2-D14) and medical supplies are not stocked here
 * (Procurement/Assets, P2-D15); neither is gated. The standing health record is Learner Wellbeing's
 * (P2-D05, `health:*`) — a distinct scope in a distinct domain.
 */
export const CLINIC_READ = "clinic:read";
export const CLINIC_WRITE = "clinic:write";
export const CLINICAL_READ = "clinical:read";
export const CLINICAL_WRITE = "clinical:write";

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
