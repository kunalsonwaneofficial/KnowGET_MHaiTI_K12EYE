import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { bandFor, type DimensionScore, type RiskBand } from "./insight-value";
import type { LearnerInsightIndicators } from "./insight-view";

/**
 * The synthesis state of a learner's insight profile. `insufficient_data` means no signals have
 * yet fed it (the score and band are not meaningful); `synthesized` means it reflects at least one
 * covered dimension.
 */
export const INSIGHT_PROFILE_STATUSES = ["insufficient_data", "synthesized"] as const;

export type InsightProfileStatus = (typeof INSIGHT_PROFILE_STATUSES)[number];

/**
 * A learner's unified intelligence profile — the synthesized, cross-dimension learning-health
 * picture (per-dimension scores and bands, an overall score and band) assembled by the pure
 * synthesis engine from the learner's signals. **Descriptive and explainable, never predictive**
 * (prediction is deferred to the intelligence core, P2-D28). One per student; refreshed (never
 * recomputed in place by hand) whenever the learner's signals change, each refresh bumping the
 * version so the picture is always a known synthesis.
 */
export interface LearnerInsightProfile {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly overallScore: number;
  readonly overallBand: RiskBand;
  readonly dimensions: readonly DimensionScore[];
  readonly signalsConsidered: number;
  readonly dimensionsCovered: number;
  readonly status: InsightProfileStatus;
  readonly version: number;
  readonly lastSynthesizedAt: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateLearnerInsightProfileParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
}

const touch = (
  profile: LearnerInsightProfile,
  patch: Partial<LearnerInsightProfile>,
): LearnerInsightProfile => ({
  ...profile,
  ...patch,
  updatedAt: nowIso(),
});

/** Create an empty learner insight profile (no signals yet — insufficient data) at version 1. */
export function createLearnerInsightProfile(
  params: CreateLearnerInsightProfileParams,
): LearnerInsightProfile {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    studentId: params.studentId,
    overallScore: 0,
    overallBand: bandFor(0),
    dimensions: [],
    signalsConsidered: 0,
    dimensionsCovered: 0,
    status: "insufficient_data",
    version: 1,
    lastSynthesizedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Refresh the profile from a fresh synthesis of the learner's signals — replace the scores, bands
 * and coverage, bump the version and stamp the synthesis time. The indicators come from the pure
 * synthesis engine (the service computes them over the learner's stored signals); the aggregate
 * never fetches or recomputes them itself. Status reflects data sufficiency.
 */
export function refreshLearnerInsight(
  profile: LearnerInsightProfile,
  indicators: LearnerInsightIndicators,
): LearnerInsightProfile {
  return touch(profile, {
    overallScore: indicators.overallScore,
    overallBand: indicators.overallBand,
    dimensions: [...indicators.dimensions],
    signalsConsidered: indicators.signalsConsidered,
    dimensionsCovered: indicators.dimensionsCovered,
    status: indicators.dimensionsCovered > 0 ? "synthesized" : "insufficient_data",
    version: profile.version + 1,
    lastSynthesizedAt: nowIso(),
  });
}
