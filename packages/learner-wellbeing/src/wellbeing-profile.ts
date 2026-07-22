import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyMetricNameError } from "./errors";
import {
  EMPTY_WELLBEING_INDICATORS,
  type SuccessMetric,
  type WellbeingIndicators,
} from "./wellbeing-indicators";
import {
  EMPTY_WELLBEING_DIMENSIONS,
  type WellbeingDimensions,
  type WellbeingLevel,
} from "./wellbeing-level";

/**
 * A learner's holistic wellbeing profile — the aggregating surface across the physical,
 * emotional, social and behavioural dimensions, learning-support indicators, success
 * metrics and AI-ready wellbeing indicators. One per student. This domain records and
 * exposes the model and integration points; prediction is deferred to the Institutional
 * Intelligence program. The learner is a P2-D03 Student; the profile derives its
 * organization from the student and never duplicates identity.
 */
export interface WellbeingProfile {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly dimensions: WellbeingDimensions;
  readonly learningSupportIndicators: readonly string[];
  readonly successMetrics: readonly SuccessMetric[];
  readonly indicators: WellbeingIndicators;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateWellbeingProfileParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
}

/** Create a new, empty wellbeing profile for a learner. */
export function createWellbeingProfile(params: CreateWellbeingProfileParams): WellbeingProfile {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    studentId: params.studentId,
    dimensions: EMPTY_WELLBEING_DIMENSIONS,
    learningSupportIndicators: [],
    successMetrics: [],
    indicators: EMPTY_WELLBEING_INDICATORS,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (profile: WellbeingProfile, patch: Partial<WellbeingProfile>): WellbeingProfile => ({
  ...profile,
  ...patch,
  updatedAt: nowIso(),
});

/** The dimension keys that may be set on a wellbeing profile. */
export type WellbeingDimensionKey = keyof WellbeingDimensions;

/** Set (or clear, with null) a single wellbeing dimension. */
export function setDimension(
  profile: WellbeingProfile,
  dimension: WellbeingDimensionKey,
  level: WellbeingLevel | null,
): WellbeingProfile {
  return touch(profile, { dimensions: { ...profile.dimensions, [dimension]: level } });
}

/** Merge a patch into the wellbeing dimensions. */
export function updateDimensions(
  profile: WellbeingProfile,
  patch: Partial<WellbeingDimensions>,
): WellbeingProfile {
  return touch(profile, { dimensions: { ...profile.dimensions, ...patch } });
}

/** Set the learning-support indicators (trimmed, non-empty, deduplicated). */
export function setLearningSupportIndicators(
  profile: WellbeingProfile,
  indicators: readonly string[],
): WellbeingProfile {
  const cleaned = [...new Set(indicators.map((i) => i.trim()).filter((i) => i.length > 0))];
  return touch(profile, { learningSupportIndicators: cleaned });
}

/** Set (add or replace) a named success metric. */
export function putSuccessMetric(
  profile: WellbeingProfile,
  name: string,
  value: number,
): WellbeingProfile {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new EmptyMetricNameError();
  }
  const others = profile.successMetrics.filter((m) => m.name !== trimmed);
  return touch(profile, { successMetrics: [...others, { name: trimmed, value }] });
}

/** Remove a named success metric (idempotent). */
export function removeSuccessMetric(profile: WellbeingProfile, name: string): WellbeingProfile {
  const trimmed = name.trim();
  return touch(profile, {
    successMetrics: profile.successMetrics.filter((m) => m.name !== trimmed),
  });
}

/** Merge a patch into the AI-ready wellbeing indicators. */
export function updateIndicators(
  profile: WellbeingProfile,
  patch: Partial<WellbeingIndicators>,
): WellbeingProfile {
  return touch(profile, { indicators: { ...profile.indicators, ...patch } });
}
