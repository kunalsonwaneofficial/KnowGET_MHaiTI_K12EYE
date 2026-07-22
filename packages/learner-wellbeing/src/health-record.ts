import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyHealthEntryError, MedicalAlertNotFoundError } from "./errors";
import type {
  Allergy,
  ChronicCondition,
  Immunization,
  Medication,
  MedicalAlert,
  MedicalAlertSeverity,
} from "./medical";

/**
 * A learner's health record — medical history, allergies, chronic conditions,
 * immunizations, medications, standing medical alerts and an emergency medical plan.
 * One per student, gated by a dedicated `health:*` permission so medical data is
 * protected through appropriate authorization. The learner is a P2-D03 Student; the
 * record derives its organization from the student.
 */
export interface HealthRecord {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly medicalHistory: string | null;
  readonly bloodGroup: string | null;
  readonly allergies: readonly Allergy[];
  readonly chronicConditions: readonly ChronicCondition[];
  readonly immunizations: readonly Immunization[];
  readonly medications: readonly Medication[];
  readonly medicalAlerts: readonly MedicalAlert[];
  readonly emergencyPlan: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateHealthRecordParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly medicalHistory?: string | null;
  readonly bloodGroup?: string | null;
}

/** Create a new health record for a learner. */
export function createHealthRecord(params: CreateHealthRecordParams): HealthRecord {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    studentId: params.studentId,
    medicalHistory: params.medicalHistory?.trim() || null,
    bloodGroup: params.bloodGroup?.trim() || null,
    allergies: [],
    chronicConditions: [],
    immunizations: [],
    medications: [],
    medicalAlerts: [],
    emergencyPlan: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (record: HealthRecord, patch: Partial<HealthRecord>): HealthRecord => ({
  ...record,
  ...patch,
  updatedAt: nowIso(),
});

/** Set the free-text medical history. */
export const setMedicalHistory = (record: HealthRecord, history: string | null): HealthRecord =>
  touch(record, { medicalHistory: history?.trim() || null });

/** Set the blood group. */
export const setBloodGroup = (record: HealthRecord, bloodGroup: string | null): HealthRecord =>
  touch(record, { bloodGroup: bloodGroup?.trim() || null });

/** Set the emergency medical plan. */
export const setEmergencyPlan = (record: HealthRecord, plan: string | null): HealthRecord =>
  touch(record, { emergencyPlan: plan?.trim() || null });

/** Add (or replace by substance) an allergy. */
export function putAllergy(record: HealthRecord, allergy: Allergy): HealthRecord {
  const substance = allergy.substance.trim();
  if (substance.length === 0) {
    throw new EmptyHealthEntryError("substance");
  }
  const normalized: Allergy = {
    substance,
    reaction: allergy.reaction?.trim() || null,
    severity: allergy.severity,
  };
  const others = record.allergies.filter((a) => a.substance !== substance);
  return touch(record, { allergies: [...others, normalized] });
}

/** Remove an allergy by substance. */
export const removeAllergy = (record: HealthRecord, substance: string): HealthRecord =>
  touch(record, {
    allergies: record.allergies.filter((a) => a.substance !== substance.trim()),
  });

/** Add a chronic condition. */
export function addChronicCondition(
  record: HealthRecord,
  condition: ChronicCondition,
): HealthRecord {
  const name = condition.name.trim();
  if (name.length === 0) {
    throw new EmptyHealthEntryError("condition name");
  }
  return touch(record, {
    chronicConditions: [
      ...record.chronicConditions,
      { name, notes: condition.notes?.trim() || null },
    ],
  });
}

/** Add an immunization. */
export function addImmunization(record: HealthRecord, immunization: Immunization): HealthRecord {
  const vaccine = immunization.vaccine.trim();
  if (vaccine.length === 0) {
    throw new EmptyHealthEntryError("vaccine");
  }
  return touch(record, {
    immunizations: [
      ...record.immunizations,
      { vaccine, administeredOn: immunization.administeredOn ?? null },
    ],
  });
}

/** Add (or replace by name) a medication, active by default. */
export function putMedication(record: HealthRecord, medication: Medication): HealthRecord {
  const name = medication.name.trim();
  if (name.length === 0) {
    throw new EmptyHealthEntryError("medication name");
  }
  const normalized: Medication = {
    name,
    dosage: medication.dosage?.trim() || null,
    active: medication.active,
  };
  const others = record.medications.filter((m) => m.name !== name);
  return touch(record, { medications: [...others, normalized] });
}

/** Discontinue a medication by name (marks it inactive). */
export function discontinueMedication(record: HealthRecord, name: string): HealthRecord {
  const target = name.trim();
  return touch(record, {
    medications: record.medications.map((m) => (m.name === target ? { ...m, active: false } : m)),
  });
}

/** Raise a standing medical alert; returns the updated record and the new alert id. */
export function raiseMedicalAlert(
  record: HealthRecord,
  label: string,
  severity: MedicalAlertSeverity,
): { record: HealthRecord; alert: MedicalAlert } {
  const trimmed = label.trim();
  if (trimmed.length === 0) {
    throw new EmptyHealthEntryError("alert label");
  }
  const alert: MedicalAlert = {
    id: newUuid(),
    label: trimmed,
    severity,
    raisedAt: nowIso(),
  };
  return { record: touch(record, { medicalAlerts: [...record.medicalAlerts, alert] }), alert };
}

/** Clear a standing medical alert by id. */
export function clearMedicalAlert(record: HealthRecord, alertId: Uuid): HealthRecord {
  if (!record.medicalAlerts.some((a) => a.id === alertId)) {
    throw new MedicalAlertNotFoundError(alertId);
  }
  return touch(record, {
    medicalAlerts: record.medicalAlerts.filter((a) => a.id !== alertId),
  });
}
