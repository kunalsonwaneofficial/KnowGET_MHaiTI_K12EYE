import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type {
  BehaviourIncident,
  BehaviourIncidentSeverity,
  BehaviourObservation,
  BehaviourObservationType,
} from "./behaviour";
import type { BehaviourRecord } from "./behaviour-record";
import type { HealthRecord } from "./health-record";

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
