import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { bandFor, type RiskBand } from "./insight-value";
import type { CohortIndicators } from "./insight-view";
import { CohortInsightStateError, EmptyInsightFieldError } from "./errors";

/** The kind of cohort a cohort insight summarizes. */
export const COHORT_SCOPE_TYPES = ["organization", "grade", "section"] as const;

export type CohortScopeType = (typeof COHORT_SCOPE_TYPES)[number];

/** Lifecycle of a cohort insight. `draft` while being set up, `published` for leadership. */
export const COHORT_INSIGHT_STATUSES = ["draft", "published"] as const;

export type CohortInsightStatus = (typeof COHORT_INSIGHT_STATUSES)[number];

/**
 * A cohort-level descriptive rollup of learner intelligence — the leadership-facing view over an
 * organization, grade or section. It carries the cohort's member learners (empty means the whole
 * organization), the summarized indicators (average learning-health and band, band distribution,
 * learners needing attention) assembled by the pure cohort-rollup engine, and a version bumped on
 * every refresh. Descriptive only — no prediction. Members are editable only while a draft.
 */
export interface CohortInsight {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly scopeType: CohortScopeType;
  readonly scopeId: Uuid;
  readonly label: string;
  readonly memberStudentIds: readonly Uuid[];
  readonly learnersConsidered: number;
  readonly averageLearningHealth: number;
  readonly averageBand: RiskBand;
  readonly bandDistribution: Readonly<Record<RiskBand, number>>;
  readonly learnersNeedingAttention: number;
  readonly status: CohortInsightStatus;
  readonly version: number;
  readonly generatedAt: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateCohortInsightParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly scopeType: CohortScopeType;
  readonly scopeId: Uuid;
  readonly label: string;
  readonly memberStudentIds?: readonly Uuid[];
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyInsightFieldError(field);
  }
  return trimmed;
};

const emptyDistribution = (): Record<RiskBand, number> => ({
  on_track: 0,
  watch: 0,
  at_risk: 0,
  critical: 0,
});

const touch = (insight: CohortInsight, patch: Partial<CohortInsight>): CohortInsight => ({
  ...insight,
  ...patch,
  updatedAt: nowIso(),
});

/** Create a new draft cohort insight (no rollup computed yet) at version 1. */
export function createCohortInsight(params: CreateCohortInsightParams): CohortInsight {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    scopeType: params.scopeType,
    scopeId: params.scopeId,
    label: requireText(params.label, "label"),
    memberStudentIds: params.memberStudentIds ? [...params.memberStudentIds] : [],
    learnersConsidered: 0,
    averageLearningHealth: 0,
    averageBand: bandFor(0),
    bandDistribution: emptyDistribution(),
    learnersNeedingAttention: 0,
    status: "draft",
    version: 1,
    generatedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Replace the cohort's member learners. Only while a draft. */
export function setCohortMembers(
  insight: CohortInsight,
  memberStudentIds: readonly Uuid[],
): CohortInsight {
  if (insight.status !== "draft") {
    throw new CohortInsightStateError(insight.id, "draft", insight.status);
  }
  return touch(insight, { memberStudentIds: [...memberStudentIds] });
}

/**
 * Refresh the rollup from a fresh cohort summary — replace the indicators, bump the version and
 * stamp the generation time. The indicators come from the pure cohort-rollup engine (the service
 * computes them over the cohort's learner profiles); the aggregate never fetches them itself.
 */
export function refreshCohortInsight(
  insight: CohortInsight,
  indicators: CohortIndicators,
): CohortInsight {
  return touch(insight, {
    learnersConsidered: indicators.learnersConsidered,
    averageLearningHealth: indicators.averageLearningHealth,
    averageBand: indicators.averageBand,
    bandDistribution: { ...indicators.bandDistribution },
    learnersNeedingAttention: indicators.learnersNeedingAttention,
    version: insight.version + 1,
    generatedAt: nowIso(),
  });
}

/** Publish the cohort insight for leadership (draft → published). Refresh still applies after. */
export function publishCohortInsight(insight: CohortInsight): CohortInsight {
  if (insight.status !== "draft") {
    throw new CohortInsightStateError(insight.id, "draft", insight.status);
  }
  return touch(insight, { status: "published" });
}
