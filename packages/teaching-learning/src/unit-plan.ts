import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyUnitPlanFieldError, UnitPlanArchivedError } from "./errors";
import type { UnitPlanStatus } from "./unit-plan-value";

/**
 * A unit plan — a sequence of related learning experiences within a subject. It maintains
 * curriculum alignment (an optional curriculum framework), the learning outcomes and
 * competencies it develops, an estimated instructional time and an assessment strategy, and is
 * the thing lessons are planned against. Draft → active → archived; an archived unit is
 * immutable. Structurally satisfies the intelligence engine's unit-plan view.
 */
export interface UnitPlan {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly subjectId: Uuid;
  readonly academicPlanId: Uuid | null;
  readonly title: string;
  readonly sequence: number;
  readonly curriculumFrameworkId: Uuid | null;
  readonly learningOutcomeIds: readonly Uuid[];
  readonly competencies: readonly string[];
  readonly estimatedInstructionalHours: number;
  readonly assessmentStrategy: string | null;
  readonly status: UnitPlanStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateUnitPlanParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly subjectId: Uuid;
  readonly academicPlanId?: Uuid | null;
  readonly title: string;
  readonly sequence?: number;
  readonly curriculumFrameworkId?: Uuid | null;
  readonly learningOutcomeIds?: readonly Uuid[];
  readonly competencies?: readonly string[];
  readonly estimatedInstructionalHours?: number;
  readonly assessmentStrategy?: string | null;
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyUnitPlanFieldError(field);
  }
  return trimmed;
};

const nonNegative = (value: number | undefined, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;

const touch = (unit: UnitPlan, patch: Partial<UnitPlan>): UnitPlan => ({
  ...unit,
  ...patch,
  updatedAt: nowIso(),
});

const assertNotArchived = (unit: UnitPlan): void => {
  if (unit.status === "archived") {
    throw new UnitPlanArchivedError(unit.id);
  }
};

/** Create a new draft unit plan. */
export function createUnitPlan(params: CreateUnitPlanParams): UnitPlan {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    subjectId: params.subjectId,
    academicPlanId: params.academicPlanId ?? null,
    title: requireText(params.title, "title"),
    sequence: nonNegative(params.sequence, 0),
    curriculumFrameworkId: params.curriculumFrameworkId ?? null,
    learningOutcomeIds: params.learningOutcomeIds ? [...params.learningOutcomeIds] : [],
    competencies: params.competencies ? [...params.competencies] : [],
    estimatedInstructionalHours: nonNegative(params.estimatedInstructionalHours, 0),
    assessmentStrategy: params.assessmentStrategy?.trim() || null,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

/** Rename the unit. Not permitted once archived. */
export function renameUnitPlan(unit: UnitPlan, title: string): UnitPlan {
  assertNotArchived(unit);
  return touch(unit, { title: requireText(title, "title") });
}

/** Replace the outcomes the unit develops. Not permitted once archived. */
export function setUnitPlanOutcomes(unit: UnitPlan, outcomeIds: readonly Uuid[]): UnitPlan {
  assertNotArchived(unit);
  return touch(unit, { learningOutcomeIds: [...outcomeIds] });
}

/** Replace the competencies the unit develops. Not permitted once archived. */
export function setUnitPlanCompetencies(unit: UnitPlan, competencies: readonly string[]): UnitPlan {
  assertNotArchived(unit);
  return touch(unit, { competencies: [...competencies] });
}

/** Set the estimated instructional time (hours). Not permitted once archived. */
export function setUnitPlanEstimatedHours(unit: UnitPlan, hours: number): UnitPlan {
  assertNotArchived(unit);
  return touch(unit, { estimatedInstructionalHours: nonNegative(hours, 0) });
}

/** Set (or clear) the unit's assessment strategy. Not permitted once archived. */
export function setUnitPlanAssessmentStrategy(
  unit: UnitPlan,
  assessmentStrategy: string | null,
): UnitPlan {
  assertNotArchived(unit);
  return touch(unit, { assessmentStrategy: assessmentStrategy?.trim() || null });
}

/** Activate the unit so lessons are planned against it (draft → active). */
export function activateUnitPlan(unit: UnitPlan): UnitPlan {
  assertNotArchived(unit);
  return touch(unit, { status: "active" });
}

/** Archive the unit. Terminal — an archived unit is immutable. */
export function archiveUnitPlan(unit: UnitPlan): UnitPlan {
  return touch(unit, { status: "archived" });
}
