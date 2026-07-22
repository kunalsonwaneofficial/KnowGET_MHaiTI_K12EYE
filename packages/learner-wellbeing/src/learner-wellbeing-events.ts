import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type {
  BehaviourIncident,
  BehaviourIncidentSeverity,
  BehaviourObservation,
  BehaviourObservationType,
} from "./behaviour";
import type { BehaviourRecord } from "./behaviour-record";
import type { CounsellingCase } from "./counselling-case";
import type { HealthRecord } from "./health-record";
import type { Intervention } from "./intervention";
import type { InterventionPlan } from "./intervention-plan";
import type { LearnerSupportPlan } from "./learner-support-plan";
import type { SafeguardingRiskLevel } from "./safeguarding";
import type { SafeguardingCase } from "./safeguarding-case";

// --- Health record ---------------------------------------------------------------
export const HEALTH_RECORD_CREATED = "wellbeing.health_record.created";
export const MEDICAL_ALERT_UPDATED = "wellbeing.medical_alert.updated";

export interface HealthRecordEventPayload {
  readonly healthRecordId: Uuid;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
}

export type HealthRecordCreatedEvent = DomainEvent<
  typeof HEALTH_RECORD_CREATED,
  HealthRecordEventPayload
>;

export interface MedicalAlertUpdatedPayload extends HealthRecordEventPayload {
  readonly activeAlerts: number;
}

export type MedicalAlertUpdatedEvent = DomainEvent<
  typeof MEDICAL_ALERT_UPDATED,
  MedicalAlertUpdatedPayload
>;

const healthPayload = (record: HealthRecord): HealthRecordEventPayload => ({
  healthRecordId: record.id,
  organizationId: record.organizationId,
  studentId: record.studentId,
});

export const healthRecordCreated = (record: HealthRecord): HealthRecordCreatedEvent =>
  createEvent(HEALTH_RECORD_CREATED, healthPayload(record), { tenantId: record.tenantId });

export const medicalAlertUpdated = (record: HealthRecord): MedicalAlertUpdatedEvent =>
  createEvent(
    MEDICAL_ALERT_UPDATED,
    { ...healthPayload(record), activeAlerts: record.medicalAlerts.length },
    { tenantId: record.tenantId },
  );

// --- Behaviour record ------------------------------------------------------------
export const BEHAVIOUR_OBSERVATION_RECORDED = "wellbeing.behaviour_observation.recorded";
export const BEHAVIOUR_INCIDENT_REPORTED = "wellbeing.behaviour_incident.reported";

export interface BehaviourObservationRecordedPayload {
  readonly behaviourRecordId: Uuid;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly observationId: Uuid;
  readonly observationType: BehaviourObservationType;
}

export type BehaviourObservationRecordedEvent = DomainEvent<
  typeof BEHAVIOUR_OBSERVATION_RECORDED,
  BehaviourObservationRecordedPayload
>;

export interface BehaviourIncidentReportedPayload {
  readonly behaviourRecordId: Uuid;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly incidentId: Uuid;
  readonly severity: BehaviourIncidentSeverity;
}

export type BehaviourIncidentReportedEvent = DomainEvent<
  typeof BEHAVIOUR_INCIDENT_REPORTED,
  BehaviourIncidentReportedPayload
>;

export const behaviourObservationRecorded = (
  record: BehaviourRecord,
  observation: BehaviourObservation,
): BehaviourObservationRecordedEvent =>
  createEvent(
    BEHAVIOUR_OBSERVATION_RECORDED,
    {
      behaviourRecordId: record.id,
      organizationId: record.organizationId,
      studentId: record.studentId,
      observationId: observation.id,
      observationType: observation.type,
    },
    { tenantId: record.tenantId },
  );

export const behaviourIncidentReported = (
  record: BehaviourRecord,
  incident: BehaviourIncident,
): BehaviourIncidentReportedEvent =>
  createEvent(
    BEHAVIOUR_INCIDENT_REPORTED,
    {
      behaviourRecordId: record.id,
      organizationId: record.organizationId,
      studentId: record.studentId,
      incidentId: incident.id,
      severity: incident.severity,
    },
    { tenantId: record.tenantId },
  );

// --- Counselling case ------------------------------------------------------------
export const COUNSELLING_CASE_OPENED = "wellbeing.counselling_case.opened";
export const COUNSELLING_CASE_CLOSED = "wellbeing.counselling_case.closed";

/**
 * Counselling events carry only non-clinical routing metadata — never the confidential
 * concern, notes or outcome. Downstream consumers coordinate; they do not learn content.
 */
export interface CounsellingCaseEventPayload {
  readonly counsellingCaseId: Uuid;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly counsellorId: Uuid;
}

export type CounsellingCaseOpenedEvent = DomainEvent<
  typeof COUNSELLING_CASE_OPENED,
  CounsellingCaseEventPayload
>;

export interface CounsellingCaseClosedPayload extends CounsellingCaseEventPayload {
  readonly sessionCount: number;
}

export type CounsellingCaseClosedEvent = DomainEvent<
  typeof COUNSELLING_CASE_CLOSED,
  CounsellingCaseClosedPayload
>;

const counsellingPayload = (kase: CounsellingCase): CounsellingCaseEventPayload => ({
  counsellingCaseId: kase.id,
  organizationId: kase.organizationId,
  studentId: kase.studentId,
  counsellorId: kase.counsellorId,
});

export const counsellingCaseOpened = (kase: CounsellingCase): CounsellingCaseOpenedEvent =>
  createEvent(COUNSELLING_CASE_OPENED, counsellingPayload(kase), { tenantId: kase.tenantId });

export const counsellingCaseClosed = (kase: CounsellingCase): CounsellingCaseClosedEvent =>
  createEvent(
    COUNSELLING_CASE_CLOSED,
    { ...counsellingPayload(kase), sessionCount: kase.sessions.length },
    { tenantId: kase.tenantId },
  );

// --- Safeguarding case -----------------------------------------------------------
export const SAFEGUARDING_CASE_OPENED = "wellbeing.safeguarding_case.opened";
export const SAFEGUARDING_CASE_ESCALATED = "wellbeing.safeguarding_case.escalated";

/**
 * Safeguarding events carry routing and risk metadata for coordination — never the
 * concern text or report content. The most sensitive surface in the platform.
 */
export interface SafeguardingCaseEventPayload {
  readonly safeguardingCaseId: Uuid;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly riskLevel: SafeguardingRiskLevel;
}

export type SafeguardingCaseOpenedEvent = DomainEvent<
  typeof SAFEGUARDING_CASE_OPENED,
  SafeguardingCaseEventPayload
>;

export interface SafeguardingCaseEscalatedPayload extends SafeguardingCaseEventPayload {
  readonly escalatedTo: string;
}

export type SafeguardingCaseEscalatedEvent = DomainEvent<
  typeof SAFEGUARDING_CASE_ESCALATED,
  SafeguardingCaseEscalatedPayload
>;

const safeguardingPayload = (kase: SafeguardingCase): SafeguardingCaseEventPayload => ({
  safeguardingCaseId: kase.id,
  organizationId: kase.organizationId,
  studentId: kase.studentId,
  riskLevel: kase.riskLevel,
});

export const safeguardingCaseOpened = (kase: SafeguardingCase): SafeguardingCaseOpenedEvent =>
  createEvent(SAFEGUARDING_CASE_OPENED, safeguardingPayload(kase), { tenantId: kase.tenantId });

export const safeguardingCaseEscalated = (
  kase: SafeguardingCase,
  escalatedTo: string,
): SafeguardingCaseEscalatedEvent =>
  createEvent(
    SAFEGUARDING_CASE_ESCALATED,
    { ...safeguardingPayload(kase), escalatedTo },
    { tenantId: kase.tenantId },
  );

// --- Learner support plan --------------------------------------------------------
export const SUPPORT_PLAN_UPDATED = "wellbeing.support_plan.updated";

export interface SupportPlanUpdatedPayload {
  readonly supportPlanId: Uuid;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
}

export type SupportPlanUpdatedEvent = DomainEvent<
  typeof SUPPORT_PLAN_UPDATED,
  SupportPlanUpdatedPayload
>;

export const supportPlanUpdated = (plan: LearnerSupportPlan): SupportPlanUpdatedEvent =>
  createEvent(
    SUPPORT_PLAN_UPDATED,
    { supportPlanId: plan.id, organizationId: plan.organizationId, studentId: plan.studentId },
    { tenantId: plan.tenantId },
  );

// --- Intervention plan -----------------------------------------------------------
export const INTERVENTION_ASSIGNED = "wellbeing.intervention.assigned";
export const INTERVENTION_COMPLETED = "wellbeing.intervention.completed";

export interface InterventionEventPayload {
  readonly interventionPlanId: Uuid;
  readonly interventionId: Uuid;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly responsibleStaff: Uuid;
}

export type InterventionAssignedEvent = DomainEvent<
  typeof INTERVENTION_ASSIGNED,
  InterventionEventPayload
>;

export type InterventionCompletedEvent = DomainEvent<
  typeof INTERVENTION_COMPLETED,
  InterventionEventPayload
>;

const interventionPayload = (
  plan: InterventionPlan,
  intervention: Intervention,
): InterventionEventPayload => ({
  interventionPlanId: plan.id,
  interventionId: intervention.id,
  organizationId: plan.organizationId,
  studentId: plan.studentId,
  responsibleStaff: intervention.responsibleStaff,
});

export const interventionAssigned = (
  plan: InterventionPlan,
  intervention: Intervention,
): InterventionAssignedEvent =>
  createEvent(INTERVENTION_ASSIGNED, interventionPayload(plan, intervention), {
    tenantId: plan.tenantId,
  });

export const interventionCompleted = (
  plan: InterventionPlan,
  intervention: Intervention,
): InterventionCompletedEvent =>
  createEvent(INTERVENTION_COMPLETED, interventionPayload(plan, intervention), {
    tenantId: plan.tenantId,
  });
