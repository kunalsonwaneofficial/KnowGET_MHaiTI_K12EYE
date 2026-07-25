import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { InsightPriority } from "./educational-insight";
import type { EvidenceRef, InsightDimension, InsightEvent } from "./insight-value";
import { EmptyInsightFieldError, RecommendationStateError } from "./errors";

/** The kind of action a recommendation proposes. */
export const RECOMMENDATION_CATEGORIES = [
  "instructional_support",
  "intervention",
  "enrichment",
  "wellbeing_support",
  "family_engagement",
  "monitoring",
] as const;

export type RecommendationCategory = (typeof RECOMMENDATION_CATEGORIES)[number];

/**
 * Lifecycle of a recommendation — **human-in-the-loop by design**: the platform only ever
 * `proposed`s a recommendation (with evidence); a responsible adult `accepted`s or `rejected`s it,
 * and an accepted recommendation is later marked `actioned`. The platform never self-accepts or
 * self-executes.
 */
export const RECOMMENDATION_STATUSES = ["proposed", "accepted", "actioned", "rejected"] as const;

export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

/**
 * An actionable, **evidence-grounded** recommendation for a learner, derived from their insights
 * and warnings. It carries the proposed action, a rationale, the supporting evidence chain and the
 * dimension it targets. Consistent with the platform's human-centred AI stance — *AI recommends
 * with evidence; humans approve* — it is only ever proposed by the platform and requires a human
 * decision (accept/reject) recorded with the decider; content is editable only while proposed.
 */
export interface Recommendation {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly category: RecommendationCategory;
  readonly action: string;
  readonly rationale: string;
  readonly priority: InsightPriority;
  readonly targetDimension: InsightDimension | null;
  readonly evidence: readonly EvidenceRef[];
  readonly status: RecommendationStatus;
  readonly decidedBy: Uuid | null;
  readonly history: readonly InsightEvent[];
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface ProposeRecommendationParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly category: RecommendationCategory;
  readonly action: string;
  readonly rationale: string;
  readonly priority?: InsightPriority;
  readonly targetDimension?: InsightDimension | null;
  readonly evidence?: readonly EvidenceRef[];
  readonly proposedBy?: Uuid | null;
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyInsightFieldError(field);
  }
  return trimmed;
};

const touch = (recommendation: Recommendation, patch: Partial<Recommendation>): Recommendation => ({
  ...recommendation,
  ...patch,
  updatedAt: nowIso(),
});

const entry = (action: string, actor: Uuid | null, note: string | null): InsightEvent => ({
  action,
  actor,
  at: nowIso(),
  note,
});

/** Content is editable only while the recommendation is proposed (before a human decides). */
const assertProposed = (recommendation: Recommendation): void => {
  if (recommendation.status !== "proposed") {
    throw new RecommendationStateError(recommendation.id, "proposed", recommendation.status);
  }
};

/** Propose a new recommendation for a learner (status `proposed`). */
export function proposeRecommendation(params: ProposeRecommendationParams): Recommendation {
  const now = nowIso();
  const actor = params.proposedBy ?? null;
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    studentId: params.studentId,
    category: params.category,
    action: requireText(params.action, "action"),
    rationale: requireText(params.rationale, "rationale"),
    priority: params.priority ?? "medium",
    targetDimension: params.targetDimension ?? null,
    evidence: params.evidence ? [...params.evidence] : [],
    status: "proposed",
    decidedBy: null,
    history: [{ action: "proposed", actor, at: now, note: null }],
    createdAt: now,
    updatedAt: now,
  };
}

/** Revise the action and rationale. Only while proposed. */
export function reviseRecommendation(
  recommendation: Recommendation,
  action: string,
  rationale: string,
): Recommendation {
  assertProposed(recommendation);
  return touch(recommendation, {
    action: requireText(action, "action"),
    rationale: requireText(rationale, "rationale"),
  });
}

/** Set the recommendation priority. Only while proposed. */
export function setRecommendationPriority(
  recommendation: Recommendation,
  priority: InsightPriority,
): Recommendation {
  assertProposed(recommendation);
  return touch(recommendation, { priority });
}

/** A human accepts the recommendation (proposed → accepted), recording who decided. */
export function acceptRecommendation(
  recommendation: Recommendation,
  decidedBy: Uuid | null = null,
  note: string | null = null,
): Recommendation {
  if (recommendation.status !== "proposed") {
    throw new RecommendationStateError(recommendation.id, "proposed", recommendation.status);
  }
  return touch(recommendation, {
    status: "accepted",
    decidedBy,
    history: [...recommendation.history, entry("accepted", decidedBy, note?.trim() || null)],
  });
}

/** A human rejects the recommendation (proposed → rejected), recording who decided. Terminal. */
export function rejectRecommendation(
  recommendation: Recommendation,
  decidedBy: Uuid | null = null,
  note: string | null = null,
): Recommendation {
  if (recommendation.status !== "proposed") {
    throw new RecommendationStateError(recommendation.id, "proposed", recommendation.status);
  }
  return touch(recommendation, {
    status: "rejected",
    decidedBy,
    history: [...recommendation.history, entry("rejected", decidedBy, note?.trim() || null)],
  });
}

/** Mark an accepted recommendation as actioned (accepted → actioned). Terminal. */
export function actionRecommendation(
  recommendation: Recommendation,
  actor: Uuid | null = null,
  note: string | null = null,
): Recommendation {
  if (recommendation.status !== "accepted") {
    throw new RecommendationStateError(recommendation.id, "accepted", recommendation.status);
  }
  return touch(recommendation, {
    status: "actioned",
    history: [...recommendation.history, entry("actioned", actor, note?.trim() || null)],
  });
}
