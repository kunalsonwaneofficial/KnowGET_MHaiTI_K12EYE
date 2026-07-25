import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { Assessment } from "./assessment";

// --- Assessment ------------------------------------------------------------------
export const ASSESSMENT_PUBLISHED = "assessment.published";
export const ASSESSMENT_STARTED = "assessment.started";
export const ASSESSMENT_COMPLETED = "assessment.completed";

export interface AssessmentEventPayload {
  readonly assessmentId: Uuid;
  readonly organizationId: Uuid;
  readonly subjectId: Uuid;
  readonly assessmentType: string;
}

export type AssessmentPublishedEvent = DomainEvent<
  typeof ASSESSMENT_PUBLISHED,
  AssessmentEventPayload
>;
export type AssessmentStartedEvent = DomainEvent<typeof ASSESSMENT_STARTED, AssessmentEventPayload>;
export type AssessmentCompletedEvent = DomainEvent<
  typeof ASSESSMENT_COMPLETED,
  AssessmentEventPayload
>;

const assessmentPayload = (assessment: Assessment): AssessmentEventPayload => ({
  assessmentId: assessment.id,
  organizationId: assessment.organizationId,
  subjectId: assessment.subjectId,
  assessmentType: assessment.assessmentType,
});

export const assessmentPublished = (assessment: Assessment): AssessmentPublishedEvent =>
  createEvent(ASSESSMENT_PUBLISHED, assessmentPayload(assessment), {
    tenantId: assessment.tenantId,
  });

export const assessmentStarted = (assessment: Assessment): AssessmentStartedEvent =>
  createEvent(ASSESSMENT_STARTED, assessmentPayload(assessment), { tenantId: assessment.tenantId });

export const assessmentCompleted = (assessment: Assessment): AssessmentCompletedEvent =>
  createEvent(ASSESSMENT_COMPLETED, assessmentPayload(assessment), {
    tenantId: assessment.tenantId,
  });
