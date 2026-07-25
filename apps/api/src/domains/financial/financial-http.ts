import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import type { TenantId } from "@knowget/types";

/**
 * Permissions gating the financial REST surface. Two scope pairs split the platform along its real
 * confidentiality boundary: `finance:*` covers the student-facing money (periods, fee structures,
 * invoices, payments, concessions and the receivables accounts), held by the fees/accounts team;
 * `payroll:*` covers staff compensation (payroll runs and payslips), held by the HR/payroll team.
 * Salary data is sensitive and separately administered, so it never shares a scope with fee data.
 */
export const FINANCE_READ = "finance:read";
export const FINANCE_WRITE = "finance:write";
export const PAYROLL_READ = "payroll:read";
export const PAYROLL_WRITE = "payroll:write";

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
