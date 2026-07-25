import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { GrowthBand } from "./faculty-value";
import type { FacultyIndicators } from "./faculty-view";

/**
 * The refresh state of a faculty profile. `insufficient_data` means it has not yet been refreshed
 * from the staff member's observations/goals/PD (the indicators are placeholders); `refreshed` means
 * it reflects a real computation of the descriptive indicators.
 */
export const FACULTY_PROFILE_STATUSES = ["insufficient_data", "refreshed"] as const;

export type FacultyProfileStatus = (typeof FACULTY_PROFILE_STATUSES)[number];

/**
 * A staff member's faculty profile — the AI-ready, **descriptive** indicator snapshot (observed-
 * practice standing, development-goal progress, PD compliance and a transparent growth band)
 * assembled by the pure {@link computeFacultyGrowth} engine. Descriptive and explainable, never a
 * prediction (predictive modelling is deferred to the intelligence core, P2-D28). One per employee;
 * refreshed (never hand-edited) whenever the staff member's evidence changes, each refresh bumping
 * the version so the picture is always a known computation.
 */
export interface FacultyProfile {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
  readonly observationsConsidered: number;
  readonly averageObservationRating: number | null;
  readonly competenciesObserved: number;
  readonly goalsTotal: number;
  readonly goalsAchieved: number;
  readonly goalProgressPct: number;
  readonly developmentComplianceRate: number;
  readonly growthBand: GrowthBand;
  readonly status: FacultyProfileStatus;
  readonly version: number;
  readonly lastRefreshedAt: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateFacultyProfileParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
}

/** Create an empty faculty profile (not yet refreshed) at version 1. */
export function createFacultyProfile(params: CreateFacultyProfileParams): FacultyProfile {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    employeeId: params.employeeId,
    observationsConsidered: 0,
    averageObservationRating: null,
    competenciesObserved: 0,
    goalsTotal: 0,
    goalsAchieved: 0,
    goalProgressPct: 0,
    developmentComplianceRate: 0,
    growthBand: "emerging",
    status: "insufficient_data",
    version: 1,
    lastRefreshedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Refresh the profile from a fresh computation of the staff member's indicators — replace the
 * snapshot, bump the version and stamp the refresh time. The indicators come from the pure engine,
 * so this function is a pure application of an already-computed, explainable result.
 */
export function refreshFacultyProfile(
  profile: FacultyProfile,
  indicators: FacultyIndicators,
): FacultyProfile {
  const now = nowIso();
  return {
    ...profile,
    observationsConsidered: indicators.observationsConsidered,
    averageObservationRating: indicators.averageObservationRating,
    competenciesObserved: indicators.competenciesObserved,
    goalsTotal: indicators.goalsTotal,
    goalsAchieved: indicators.goalsAchieved,
    goalProgressPct: indicators.goalProgressPct,
    developmentComplianceRate: indicators.developmentComplianceRate,
    growthBand: indicators.growthBand,
    status: "refreshed",
    version: profile.version + 1,
    lastRefreshedAt: now,
    updatedAt: now,
  };
}
