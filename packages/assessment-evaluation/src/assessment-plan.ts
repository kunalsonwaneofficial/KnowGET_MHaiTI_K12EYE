import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type {
  AssessmentPlanStatus,
  AssessmentPlanType,
  PlannedAssessment,
} from "./assessment-plan-value";
import { AssessmentPlanStateError, EmptyAssessmentPlanFieldError } from "./errors";

/**
 * An assessment plan — the annual assessment calendar, a term/unit plan, or the classroom
 * assessment schedule — carrying the planned assessments and examination timetable for a scope
 * (optionally a subject/grade in an academic year and term). Draft → published → archived;
 * publishing makes the schedule authoritative; an archived plan is immutable.
 */
export interface AssessmentPlan {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly planType: AssessmentPlanType;
  readonly title: string;
  readonly academicYear: string | null;
  readonly term: string | null;
  readonly subjectId: Uuid | null;
  readonly gradeId: Uuid | null;
  readonly plannedAssessments: readonly PlannedAssessment[];
  readonly status: AssessmentPlanStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateAssessmentPlanParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly planType: AssessmentPlanType;
  readonly title: string;
  readonly academicYear?: string | null;
  readonly term?: string | null;
  readonly subjectId?: Uuid | null;
  readonly gradeId?: Uuid | null;
  readonly plannedAssessments?: readonly PlannedAssessment[];
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyAssessmentPlanFieldError(field);
  }
  return trimmed;
};

const touch = (plan: AssessmentPlan, patch: Partial<AssessmentPlan>): AssessmentPlan => ({
  ...plan,
  ...patch,
  updatedAt: nowIso(),
});

const assertNotArchived = (plan: AssessmentPlan): void => {
  if (plan.status === "archived") {
    throw new AssessmentPlanStateError(plan.id, "not archived", plan.status);
  }
};

/** Create a new draft assessment plan. */
export function createAssessmentPlan(params: CreateAssessmentPlanParams): AssessmentPlan {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    planType: params.planType,
    title: requireText(params.title, "title"),
    academicYear: params.academicYear?.trim() || null,
    term: params.term?.trim() || null,
    subjectId: params.subjectId ?? null,
    gradeId: params.gradeId ?? null,
    plannedAssessments: params.plannedAssessments ? [...params.plannedAssessments] : [],
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

/** Rename the plan. Not permitted once archived. */
export function renameAssessmentPlan(plan: AssessmentPlan, title: string): AssessmentPlan {
  assertNotArchived(plan);
  return touch(plan, { title: requireText(title, "title") });
}

/** Replace the planned assessments / examination schedule. Not permitted once archived. */
export function setPlannedAssessments(
  plan: AssessmentPlan,
  plannedAssessments: readonly PlannedAssessment[],
): AssessmentPlan {
  assertNotArchived(plan);
  return touch(plan, { plannedAssessments: [...plannedAssessments] });
}

/** Publish the plan so its schedule is authoritative (draft → published). */
export function publishAssessmentPlan(plan: AssessmentPlan): AssessmentPlan {
  if (plan.status !== "draft") {
    throw new AssessmentPlanStateError(plan.id, "draft", plan.status);
  }
  return touch(plan, { status: "published" });
}

/** Archive the plan. Terminal — an archived plan is immutable. */
export function archiveAssessmentPlan(plan: AssessmentPlan): AssessmentPlan {
  return touch(plan, { status: "archived" });
}
