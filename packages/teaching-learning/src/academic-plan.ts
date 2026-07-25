import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { AcademicPlanStatus, AcademicPlanType } from "./academic-plan-type";
import { AcademicPlanStateError, EmptyAcademicPlanFieldError } from "./errors";

/**
 * Institutional instructional planning at a level (annual / term / department / subject). A
 * plan carries planning objectives and an optional period and subject, one per (organization,
 * code), across a draft → published → archived lifecycle. Publishing makes the plan
 * authoritative for the delivery that follows (unit and lesson planning); an archived plan is
 * immutable. Planning scope only — it schedules nothing and grades nothing.
 */
export interface AcademicPlan {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly planType: AcademicPlanType;
  readonly code: string;
  readonly title: string;
  readonly academicYear: string | null;
  readonly term: string | null;
  readonly subjectId: Uuid | null;
  readonly objectives: readonly string[];
  readonly fromDate: string | null;
  readonly toDate: string | null;
  readonly status: AcademicPlanStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateAcademicPlanParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly planType: AcademicPlanType;
  readonly code: string;
  readonly title: string;
  readonly academicYear?: string | null;
  readonly term?: string | null;
  readonly subjectId?: Uuid | null;
  readonly objectives?: readonly string[];
  readonly fromDate?: string | null;
  readonly toDate?: string | null;
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyAcademicPlanFieldError(field);
  }
  return trimmed;
};

const touch = (plan: AcademicPlan, patch: Partial<AcademicPlan>): AcademicPlan => ({
  ...plan,
  ...patch,
  updatedAt: nowIso(),
});

const assertNotArchived = (plan: AcademicPlan): void => {
  if (plan.status === "archived") {
    throw new AcademicPlanStateError(plan.id, "not archived", plan.status);
  }
};

/** Create a new draft academic plan. */
export function createAcademicPlan(params: CreateAcademicPlanParams): AcademicPlan {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    planType: params.planType,
    code: requireText(params.code, "code"),
    title: requireText(params.title, "title"),
    academicYear: params.academicYear?.trim() || null,
    term: params.term?.trim() || null,
    subjectId: params.subjectId ?? null,
    objectives: params.objectives ? [...params.objectives] : [],
    fromDate: params.fromDate ?? null,
    toDate: params.toDate ?? null,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

/** Rename the plan. Not permitted once archived. */
export function renameAcademicPlan(plan: AcademicPlan, title: string): AcademicPlan {
  assertNotArchived(plan);
  return touch(plan, { title: requireText(title, "title") });
}

/** Replace the plan's objectives. Not permitted once archived. */
export function setAcademicPlanObjectives(
  plan: AcademicPlan,
  objectives: readonly string[],
): AcademicPlan {
  assertNotArchived(plan);
  return touch(plan, { objectives: [...objectives] });
}

/** Set (or clear) the plan's period. Not permitted once archived. */
export function setAcademicPlanPeriod(
  plan: AcademicPlan,
  fromDate: string | null,
  toDate: string | null,
): AcademicPlan {
  assertNotArchived(plan);
  return touch(plan, { fromDate: fromDate ?? null, toDate: toDate ?? null });
}

/** Publish the plan so it is authoritative for delivery (draft → published). */
export function publishAcademicPlan(plan: AcademicPlan): AcademicPlan {
  if (plan.status !== "draft") {
    throw new AcademicPlanStateError(plan.id, "draft", plan.status);
  }
  return touch(plan, { status: "published" });
}

/** Archive the plan. Terminal — an archived plan is immutable. */
export function archiveAcademicPlan(plan: AcademicPlan): AcademicPlan {
  return touch(plan, { status: "archived" });
}
