import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { CompetencyRating, CompetencyRatingInput } from "./competency";
import {
  EmptyRatingsError,
  InvalidObservationRatingError,
  InvalidObservationTransitionError,
} from "./errors";
import { isValidRating, type ObservationStatus, type ObservationType } from "./faculty-value";

/**
 * A classroom/practice observation of a staff member against a {@link CompetencyFramework}. It
 * carries the observer, the observed employee, per-competency 1–4 ratings with evidence, an overall
 * rating (the mean of those ratings), and strengths/growth-area notes. It runs `scheduled →
 * conducted → shared → acknowledged`; ratings/notes are editable only while `conducted` and are
 * frozen once shared. Only an **acknowledged** observation counts toward faculty-growth standing.
 */
export interface Observation {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly frameworkId: Uuid;
  readonly employeeId: Uuid;
  readonly observerId: Uuid;
  readonly observationType: ObservationType;
  readonly observedOn: string;
  readonly context: string | null;
  readonly ratings: readonly CompetencyRating[];
  readonly overallRating: number | null;
  readonly strengths: string | null;
  readonly growthAreas: string | null;
  readonly status: ObservationStatus;
  readonly sharedAt: string | null;
  readonly acknowledgedAt: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface ScheduleObservationParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly frameworkId: Uuid;
  readonly employeeId: Uuid;
  readonly observerId: Uuid;
  readonly observationType: ObservationType;
  readonly observedOn?: string | null;
  readonly context?: string | null;
}

export interface ConductObservationParams {
  readonly ratings: readonly CompetencyRatingInput[];
  readonly strengths?: string | null;
  readonly growthAreas?: string | null;
}

/** Validate and normalize the ratings (non-empty; each on the 1–4 scale). */
function buildRatings(inputs: readonly CompetencyRatingInput[]): CompetencyRating[] {
  if (inputs.length === 0) {
    throw new EmptyRatingsError();
  }
  return inputs.map((input) => {
    if (!isValidRating(input.rating)) {
      throw new InvalidObservationRatingError(input.competencyKey, input.rating);
    }
    return {
      competencyKey: input.competencyKey,
      rating: input.rating,
      comment: input.comment?.trim() || null,
    };
  });
}

const meanRating = (ratings: readonly CompetencyRating[]): number =>
  Math.round((ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length) * 100) / 100;

/** Schedule an observation (status `scheduled`, no ratings yet). */
export function scheduleObservation(params: ScheduleObservationParams): Observation {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    frameworkId: params.frameworkId,
    employeeId: params.employeeId,
    observerId: params.observerId,
    observationType: params.observationType,
    observedOn: params.observedOn ?? now.slice(0, 10),
    context: params.context?.trim() || null,
    ratings: [],
    overallRating: null,
    strengths: null,
    growthAreas: null,
    status: "scheduled",
    sharedAt: null,
    acknowledgedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (observation: Observation, patch: Partial<Observation>): Observation => ({
  ...observation,
  ...patch,
  updatedAt: nowIso(),
});

/** Record the ratings and notes for a scheduled observation (→ `conducted`). */
export function conductObservation(
  observation: Observation,
  params: ConductObservationParams,
): Observation {
  if (observation.status !== "scheduled") {
    throw new InvalidObservationTransitionError(observation.status, "conducted");
  }
  const ratings = buildRatings(params.ratings);
  return touch(observation, {
    ratings,
    overallRating: meanRating(ratings),
    strengths: params.strengths?.trim() || null,
    growthAreas: params.growthAreas?.trim() || null,
    status: "conducted",
  });
}

/** Revise the ratings/notes of a conducted (not yet shared) observation. */
export function reviseObservation(
  observation: Observation,
  params: ConductObservationParams,
): Observation {
  if (observation.status !== "conducted") {
    throw new InvalidObservationTransitionError(observation.status, "revised");
  }
  const ratings = buildRatings(params.ratings);
  return touch(observation, {
    ratings,
    overallRating: meanRating(ratings),
    strengths: params.strengths?.trim() || null,
    growthAreas: params.growthAreas?.trim() || null,
  });
}

/** Share a conducted observation with the observed staff member (→ `shared`). */
export function shareObservation(observation: Observation): Observation {
  if (observation.status !== "conducted") {
    throw new InvalidObservationTransitionError(observation.status, "shared");
  }
  return touch(observation, { status: "shared", sharedAt: nowIso() });
}

/** The observed staff member acknowledges a shared observation (→ `acknowledged`). */
export function acknowledgeObservation(observation: Observation): Observation {
  if (observation.status !== "shared") {
    throw new InvalidObservationTransitionError(observation.status, "acknowledged");
  }
  return touch(observation, { status: "acknowledged", acknowledgedAt: nowIso() });
}

/** Whether the observation is acknowledged (and therefore counts toward growth standing). */
export const isObservationAcknowledged = (observation: Observation): boolean =>
  observation.status === "acknowledged";

/** The distinct competency keys rated in this observation. */
export const observationCompetencyKeys = (observation: Observation): string[] => [
  ...new Set(observation.ratings.map((r) => r.competencyKey)),
];
