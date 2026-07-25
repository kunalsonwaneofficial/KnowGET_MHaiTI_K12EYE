import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { EvidenceRef, InsightDimension, InsightEvent } from "./insight-value";
import { EducationalInsightStateError, EmptyInsightFieldError } from "./errors";

/** What an educational insight is about a learner — a strength, a gap, a trend, a risk or an opportunity. */
export const INSIGHT_CATEGORIES = ["strength", "gap", "trend", "risk", "opportunity"] as const;

export type InsightCategory = (typeof INSIGHT_CATEGORIES)[number];

/** How much attention an insight warrants. */
export const INSIGHT_PRIORITIES = ["low", "medium", "high"] as const;

export type InsightPriority = (typeof INSIGHT_PRIORITIES)[number];

/**
 * Lifecycle of an educational insight. `proposed` while being drafted (content editable), then
 * `published` (visible to educators) and finally `archived` (superseded or no longer relevant).
 */
export const INSIGHT_STATUSES = ["proposed", "published", "archived"] as const;

export type InsightStatus = (typeof INSIGHT_STATUSES)[number];

/**
 * A generated, **explainable** educational finding about a learner — a strength, gap, trend, risk
 * or opportunity — with a human-readable narrative and the supporting evidence chain. It is a
 * descriptive interpretation of the learner's synthesized intelligence, not a prediction; content
 * is editable only while `proposed`, and publishing makes it visible to educators.
 */
export interface EducationalInsight {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly category: InsightCategory;
  readonly dimension: InsightDimension | null;
  readonly title: string;
  readonly narrative: string;
  readonly priority: InsightPriority;
  readonly evidence: readonly EvidenceRef[];
  readonly status: InsightStatus;
  readonly history: readonly InsightEvent[];
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface ProposeEducationalInsightParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly category: InsightCategory;
  readonly title: string;
  readonly narrative: string;
  readonly dimension?: InsightDimension | null;
  readonly priority?: InsightPriority;
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

const touch = (
  insight: EducationalInsight,
  patch: Partial<EducationalInsight>,
): EducationalInsight => ({
  ...insight,
  ...patch,
  updatedAt: nowIso(),
});

const entry = (action: string, actor: Uuid | null, note: string | null): InsightEvent => ({
  action,
  actor,
  at: nowIso(),
  note,
});

/** Content is editable only while the insight is proposed. */
const assertProposed = (insight: EducationalInsight): void => {
  if (insight.status !== "proposed") {
    throw new EducationalInsightStateError(insight.id, "proposed", insight.status);
  }
};

/** Propose a new educational insight for a learner (status `proposed`). */
export function proposeEducationalInsight(
  params: ProposeEducationalInsightParams,
): EducationalInsight {
  const now = nowIso();
  const actor = params.proposedBy ?? null;
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    studentId: params.studentId,
    category: params.category,
    dimension: params.dimension ?? null,
    title: requireText(params.title, "title"),
    narrative: requireText(params.narrative, "narrative"),
    priority: params.priority ?? "medium",
    evidence: params.evidence ? [...params.evidence] : [],
    status: "proposed",
    history: [{ action: "proposed", actor, at: now, note: null }],
    createdAt: now,
    updatedAt: now,
  };
}

/** Revise the title and narrative. Only while proposed. */
export function reviseEducationalInsight(
  insight: EducationalInsight,
  title: string,
  narrative: string,
): EducationalInsight {
  assertProposed(insight);
  return touch(insight, {
    title: requireText(title, "title"),
    narrative: requireText(narrative, "narrative"),
  });
}

/** Set the insight priority. Only while proposed. */
export function setInsightPriority(
  insight: EducationalInsight,
  priority: InsightPriority,
): EducationalInsight {
  assertProposed(insight);
  return touch(insight, { priority });
}

/** Publish the insight, making it visible to educators (proposed → published). */
export function publishEducationalInsight(
  insight: EducationalInsight,
  actor: Uuid | null = null,
): EducationalInsight {
  if (insight.status !== "proposed") {
    throw new EducationalInsightStateError(insight.id, "proposed", insight.status);
  }
  return touch(insight, {
    status: "published",
    history: [...insight.history, entry("published", actor, null)],
  });
}

/** Archive the insight — superseded or no longer relevant (from any state). Terminal. */
export function archiveEducationalInsight(
  insight: EducationalInsight,
  actor: Uuid | null = null,
  note: string | null = null,
): EducationalInsight {
  if (insight.status === "archived") {
    throw new EducationalInsightStateError(insight.id, "not archived", insight.status);
  }
  return touch(insight, {
    status: "archived",
    history: [...insight.history, entry("archived", actor, note?.trim() || null)],
  });
}
