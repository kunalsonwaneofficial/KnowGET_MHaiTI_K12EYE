import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { NegativeRequirementError } from "./errors";
import type { PdCategory } from "./faculty-value";

/**
 * A development requirement — the CPD mandate of how many professional-development hours of a given
 * {@link PdCategory} a staff member must complete in a period (for example 20 pedagogy hours for
 * "2026"). It is the "required" side of the pure development ledger; completed activities draw it
 * down. An employee holds at most one requirement per category per period.
 */
export interface DevelopmentRequirement {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
  readonly category: PdCategory;
  readonly period: string;
  readonly requiredHours: number;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface SetRequirementParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
  readonly category: PdCategory;
  readonly period: string;
  readonly requiredHours: number;
}

const assertNonNegative = (requiredHours: number): void => {
  if (!Number.isFinite(requiredHours) || requiredHours < 0) {
    throw new NegativeRequirementError(requiredHours);
  }
};

/** Set a development requirement. The hour count must be zero or positive. */
export function setRequirement(params: SetRequirementParams): DevelopmentRequirement {
  assertNonNegative(params.requiredHours);
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    employeeId: params.employeeId,
    category: params.category,
    period: params.period,
    requiredHours: params.requiredHours,
    createdAt: now,
    updatedAt: now,
  };
}

/** Revise a requirement's hour count (zero or positive). */
export function setRequiredHours(
  requirement: DevelopmentRequirement,
  requiredHours: number,
): DevelopmentRequirement {
  assertNonNegative(requiredHours);
  return { ...requirement, requiredHours, updatedAt: nowIso() };
}
