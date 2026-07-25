import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { AcademicRecord } from "./academic-record";
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

// --- Academic record -------------------------------------------------------------
export const ACADEMIC_RECORD_UPDATED = "assessment.academic_record.updated";
export const PROMOTION_RECOMMENDED = "assessment.promotion.recommended";

export interface AcademicRecordEventPayload {
  readonly academicRecordId: Uuid;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly academicYear: string;
  readonly term: string;
  readonly status: string;
}

export type AcademicRecordUpdatedEvent = DomainEvent<
  typeof ACADEMIC_RECORD_UPDATED,
  AcademicRecordEventPayload
>;

const academicRecordPayload = (record: AcademicRecord): AcademicRecordEventPayload => ({
  academicRecordId: record.id,
  organizationId: record.organizationId,
  studentId: record.studentId,
  academicYear: record.academicYear,
  term: record.term,
  status: record.status,
});

export const academicRecordUpdated = (record: AcademicRecord): AcademicRecordUpdatedEvent =>
  createEvent(ACADEMIC_RECORD_UPDATED, academicRecordPayload(record), {
    tenantId: record.tenantId,
  });

export interface PromotionRecommendedPayload {
  readonly academicRecordId: Uuid;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly academicYear: string;
  readonly term: string;
  readonly promotionDecision: string;
}

export type PromotionRecommendedEvent = DomainEvent<
  typeof PROMOTION_RECOMMENDED,
  PromotionRecommendedPayload
>;

export const promotionRecommended = (record: AcademicRecord): PromotionRecommendedEvent =>
  createEvent(
    PROMOTION_RECOMMENDED,
    {
      academicRecordId: record.id,
      organizationId: record.organizationId,
      studentId: record.studentId,
      academicYear: record.academicYear,
      term: record.term,
      promotionDecision: record.promotionDecision,
    },
    { tenantId: record.tenantId },
  );

// --- Reporting -------------------------------------------------------------------
export const REPORT_CARD_GENERATED = "assessment.report_card.generated";

export interface ReportCardGeneratedPayload {
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly academicYear: string;
  readonly term: string;
  readonly academicRecordId: Uuid | null;
}

export type ReportCardGeneratedEvent = DomainEvent<
  typeof REPORT_CARD_GENERATED,
  ReportCardGeneratedPayload
>;

export const reportCardGenerated = (
  tenantId: AcademicRecord["tenantId"],
  payload: ReportCardGeneratedPayload,
): ReportCardGeneratedEvent => createEvent(REPORT_CARD_GENERATED, payload, { tenantId });
