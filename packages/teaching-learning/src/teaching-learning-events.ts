import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { AcademicPlan } from "./academic-plan";
import type { Assignment } from "./assignment";
import type { AssignmentSubmission } from "./assignment-type";
import type { ClassroomSession } from "./classroom-session";
import type { LearningResource } from "./learning-resource";
import type { LessonPlan } from "./lesson-plan";
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

// --- Lesson plan -----------------------------------------------------------------
export const LESSON_PLANNED = "teaching.lesson.planned";

export interface LessonPlannedPayload {
  readonly lessonPlanId: Uuid;
  readonly organizationId: Uuid;
  readonly subjectId: Uuid;
  readonly unitPlanId: Uuid | null;
  readonly title: string;
}

export type LessonPlannedEvent = DomainEvent<typeof LESSON_PLANNED, LessonPlannedPayload>;

export const lessonPlanned = (plan: LessonPlan): LessonPlannedEvent =>
  createEvent(
    LESSON_PLANNED,
    {
      lessonPlanId: plan.id,
      organizationId: plan.organizationId,
      subjectId: plan.subjectId,
      unitPlanId: plan.unitPlanId,
      title: plan.title,
    },
    { tenantId: plan.tenantId },
  );

// --- Learning resource -----------------------------------------------------------
export const LEARNING_RESOURCE_ADDED = "teaching.learning_resource.added";

export interface LearningResourceAddedPayload {
  readonly learningResourceId: Uuid;
  readonly organizationId: Uuid;
  readonly resourceType: string;
  readonly title: string;
}

export type LearningResourceAddedEvent = DomainEvent<
  typeof LEARNING_RESOURCE_ADDED,
  LearningResourceAddedPayload
>;

export const learningResourceAdded = (resource: LearningResource): LearningResourceAddedEvent =>
  createEvent(
    LEARNING_RESOURCE_ADDED,
    {
      learningResourceId: resource.id,
      organizationId: resource.organizationId,
      resourceType: resource.resourceType,
      title: resource.title,
    },
    { tenantId: resource.tenantId },
  );

// --- Classroom session -----------------------------------------------------------
export const LESSON_DELIVERED = "teaching.lesson.delivered";
export const CLASSROOM_SESSION_COMPLETED = "teaching.classroom_session.completed";

export interface ClassroomSessionEventPayload {
  readonly classroomSessionId: Uuid;
  readonly organizationId: Uuid;
  readonly lessonPlanId: Uuid | null;
  readonly date: string;
}

export type LessonDeliveredEvent = DomainEvent<
  typeof LESSON_DELIVERED,
  ClassroomSessionEventPayload
>;
export type ClassroomSessionCompletedEvent = DomainEvent<
  typeof CLASSROOM_SESSION_COMPLETED,
  ClassroomSessionEventPayload
>;

const sessionPayload = (session: ClassroomSession): ClassroomSessionEventPayload => ({
  classroomSessionId: session.id,
  organizationId: session.organizationId,
  lessonPlanId: session.lessonPlanId,
  date: session.date,
});

export const lessonDelivered = (session: ClassroomSession): LessonDeliveredEvent =>
  createEvent(LESSON_DELIVERED, sessionPayload(session), { tenantId: session.tenantId });

export const classroomSessionCompleted = (
  session: ClassroomSession,
): ClassroomSessionCompletedEvent =>
  createEvent(CLASSROOM_SESSION_COMPLETED, sessionPayload(session), {
    tenantId: session.tenantId,
  });

// --- Assignment ------------------------------------------------------------------
export const ASSIGNMENT_PUBLISHED = "teaching.assignment.published";
export const ASSIGNMENT_SUBMITTED = "teaching.assignment.submitted";

export interface AssignmentPublishedPayload {
  readonly assignmentId: Uuid;
  readonly organizationId: Uuid;
  readonly subjectId: Uuid;
  readonly assignmentType: string;
}

export interface AssignmentSubmittedPayload {
  readonly assignmentId: Uuid;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly status: string;
}

export type AssignmentPublishedEvent = DomainEvent<
  typeof ASSIGNMENT_PUBLISHED,
  AssignmentPublishedPayload
>;
export type AssignmentSubmittedEvent = DomainEvent<
  typeof ASSIGNMENT_SUBMITTED,
  AssignmentSubmittedPayload
>;

export const assignmentPublished = (assignment: Assignment): AssignmentPublishedEvent =>
  createEvent(
    ASSIGNMENT_PUBLISHED,
    {
      assignmentId: assignment.id,
      organizationId: assignment.organizationId,
      subjectId: assignment.subjectId,
      assignmentType: assignment.assignmentType,
    },
    { tenantId: assignment.tenantId },
  );

export const assignmentSubmitted = (
  assignment: Assignment,
  submission: AssignmentSubmission,
): AssignmentSubmittedEvent =>
  createEvent(
    ASSIGNMENT_SUBMITTED,
    {
      assignmentId: assignment.id,
      organizationId: assignment.organizationId,
      studentId: submission.studentId,
      status: submission.status,
    },
    { tenantId: assignment.tenantId },
  );
