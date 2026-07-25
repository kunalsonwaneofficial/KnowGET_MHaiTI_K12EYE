import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { AcademicPlan } from "./academic-plan";
import type { UnitPlan } from "./unit-plan";

// --- Academic plan ---------------------------------------------------------------
export const ACADEMIC_PLAN_PUBLISHED = "teaching.academic_plan.published";

export interface AcademicPlanPublishedPayload {
  readonly academicPlanId: Uuid;
  readonly organizationId: Uuid;
  readonly planType: string;
  readonly code: string;
}

export type AcademicPlanPublishedEvent = DomainEvent<
  typeof ACADEMIC_PLAN_PUBLISHED,
  AcademicPlanPublishedPayload
>;

export const academicPlanPublished = (plan: AcademicPlan): AcademicPlanPublishedEvent =>
  createEvent(
    ACADEMIC_PLAN_PUBLISHED,
    {
      academicPlanId: plan.id,
      organizationId: plan.organizationId,
      planType: plan.planType,
      code: plan.code,
    },
    { tenantId: plan.tenantId },
  );

// --- Unit plan -------------------------------------------------------------------
export const UNIT_PLAN_CREATED = "teaching.unit_plan.created";

export interface UnitPlanCreatedPayload {
  readonly unitPlanId: Uuid;
  readonly organizationId: Uuid;
  readonly subjectId: Uuid;
  readonly title: string;
}

export type UnitPlanCreatedEvent = DomainEvent<typeof UNIT_PLAN_CREATED, UnitPlanCreatedPayload>;

export const unitPlanCreated = (unit: UnitPlan): UnitPlanCreatedEvent =>
  createEvent(
    UNIT_PLAN_CREATED,
    {
      unitPlanId: unit.id,
      organizationId: unit.organizationId,
      subjectId: unit.subjectId,
      title: unit.title,
    },
    { tenantId: unit.tenantId },
  );
