import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { EmploymentStatus } from "./workforce-value";
import type { WorkforceIndicators } from "./workforce-view";

/**
 * The refresh state of a workforce profile. `insufficient_data` means it has not yet been refreshed
 * from the employee's tenure/leave/review facts (the indicators are placeholders); `refreshed` means
 * it reflects a real computation of the descriptive indicators.
 */
export const WORKFORCE_PROFILE_STATUSES = ["insufficient_data", "refreshed"] as const;

export type WorkforceProfileStatus = (typeof WORKFORCE_PROFILE_STATUSES)[number];

/**
 * An employee's workforce profile — the AI-ready, **descriptive** indicator snapshot (tenure, leave
 * utilization, review standing and a transparent attrition-risk band) assembled by the pure
 * {@link computeWorkforceIndicators} engine. Descriptive and explainable, never a prediction
 * (predictive modelling is deferred to the intelligence core, P2-D28). One per employee; refreshed
 * (never hand-edited) whenever the employee's facts change, each refresh bumping the version so the
 * picture is always a known computation.
 */
export interface WorkforceProfile {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
  readonly tenureMonths: number;
  readonly employmentStatus: EmploymentStatus;
  readonly leaveUtilizationRate: number;
  readonly reviewsFinalized: number;
  readonly averageReviewRating: number | null;
  readonly attritionRiskBand: WorkforceIndicators["attritionRiskBand"];
  readonly status: WorkforceProfileStatus;
  readonly version: number;
  readonly lastRefreshedAt: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateWorkforceProfileParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
  readonly employmentStatus: EmploymentStatus;
}

/** Create an empty workforce profile (not yet refreshed) at version 1. */
export function createWorkforceProfile(params: CreateWorkforceProfileParams): WorkforceProfile {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    employeeId: params.employeeId,
    tenureMonths: 0,
    employmentStatus: params.employmentStatus,
    leaveUtilizationRate: 0,
    reviewsFinalized: 0,
    averageReviewRating: null,
    attritionRiskBand: "low",
    status: "insufficient_data",
    version: 1,
    lastRefreshedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Refresh the profile from a fresh computation of the employee's indicators — replace the snapshot,
 * bump the version and stamp the refresh time. The indicators come from the pure engine, so this
 * function is a pure application of an already-computed, explainable result.
 */
export function refreshWorkforceProfile(
  profile: WorkforceProfile,
  indicators: WorkforceIndicators,
): WorkforceProfile {
  const now = nowIso();
  return {
    ...profile,
    tenureMonths: indicators.tenureMonths,
    employmentStatus: indicators.employmentStatus,
    leaveUtilizationRate: indicators.leaveUtilizationRate,
    reviewsFinalized: indicators.reviewsFinalized,
    averageReviewRating: indicators.averageReviewRating,
    attritionRiskBand: indicators.attritionRiskBand,
    status: "refreshed",
    version: profile.version + 1,
    lastRefreshedAt: now,
    updatedAt: now,
  };
}
