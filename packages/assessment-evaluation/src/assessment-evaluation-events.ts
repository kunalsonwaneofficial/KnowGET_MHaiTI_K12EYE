import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { Assessment } from "./assessment";
import type { CompetencyProfile } from "./competency-profile";
import type { Evaluation } from "./evaluation";

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

// --- Evaluation ------------------------------------------------------------------
export const EVALUATION_SUBMITTED = "assessment.evaluation.submitted";
export const EVALUATION_APPROVED = "assessment.evaluation.approved";

export interface EvaluationEventPayload {
  readonly evaluationId: Uuid;
  readonly organizationId: Uuid;
  readonly assessmentId: Uuid;
  readonly studentId: Uuid;
  readonly status: string;
}

export type EvaluationSubmittedEvent = DomainEvent<
  typeof EVALUATION_SUBMITTED,
  EvaluationEventPayload
>;
export type EvaluationApprovedEvent = DomainEvent<
  typeof EVALUATION_APPROVED,
  EvaluationEventPayload
>;

const evaluationPayload = (evaluation: Evaluation): EvaluationEventPayload => ({
  evaluationId: evaluation.id,
  organizationId: evaluation.organizationId,
  assessmentId: evaluation.assessmentId,
  studentId: evaluation.studentId,
  status: evaluation.status,
});

export const evaluationSubmitted = (evaluation: Evaluation): EvaluationSubmittedEvent =>
  createEvent(EVALUATION_SUBMITTED, evaluationPayload(evaluation), {
    tenantId: evaluation.tenantId,
  });

export const evaluationApproved = (evaluation: Evaluation): EvaluationApprovedEvent =>
  createEvent(EVALUATION_APPROVED, evaluationPayload(evaluation), {
    tenantId: evaluation.tenantId,
  });

// --- Competency ------------------------------------------------------------------
export const COMPETENCY_UPDATED = "assessment.competency.updated";

export interface CompetencyUpdatedPayload {
  readonly competencyProfileId: Uuid;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly competencyId: string;
  readonly masteryLevel: string;
}

export type CompetencyUpdatedEvent = DomainEvent<
  typeof COMPETENCY_UPDATED,
  CompetencyUpdatedPayload
>;

export const competencyUpdated = (
  profile: CompetencyProfile,
  competencyId: string,
  masteryLevel: string,
): CompetencyUpdatedEvent =>
  createEvent(
    COMPETENCY_UPDATED,
    {
      competencyProfileId: profile.id,
      organizationId: profile.organizationId,
      studentId: profile.studentId,
      competencyId,
      masteryLevel,
    },
    { tenantId: profile.tenantId },
  );
