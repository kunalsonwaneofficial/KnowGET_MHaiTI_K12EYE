import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
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
