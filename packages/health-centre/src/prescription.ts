import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  DoseLimitReachedError,
  EmptyMedicationError,
  InvalidPrescriptionTransitionError,
  InvalidRegimenError,
} from "./errors";
import type { PrescriptionStatus } from "./health-centre-value";

/**
 * A prescription — a medication course a clinician orders for a patient at a health centre. It captures
 * the medication and dosage (free-text clinical content held on the aggregate but **never** placed on a
 * domain event), and the regimen — doses per day, the duration in days and the start date — that the pure
 * medication-schedule engine reads to derive the due/overdue doses. `dosesAdministered` counts the doses
 * given so far. It runs `active → completed | discontinued`. There is no money here — the drug's cost is
 * Procurement/Assets' (P2-D15).
 */
export interface Prescription {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly centreId: Uuid;
  readonly patientId: Uuid;
  readonly clinicianId: Uuid;
  readonly medication: string;
  readonly dosage: string | null;
  readonly frequencyPerDay: number;
  readonly durationDays: number;
  readonly startDate: string;
  readonly dosesAdministered: number;
  readonly status: PrescriptionStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface IssuePrescriptionParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly centreId: Uuid;
  readonly patientId: Uuid;
  readonly clinicianId: Uuid;
  readonly medication: string;
  readonly frequencyPerDay: number;
  readonly durationDays: number;
  readonly startDate: string;
  readonly dosage?: string | null;
}

const requirePositiveInt = (value: number): number => {
  if (!Number.isInteger(value) || value < 1) {
    throw new InvalidRegimenError(value);
  }
  return value;
};

/** The total doses the course prescribes (doses per day × duration in days). */
export const totalDosesOf = (prescription: Prescription): number =>
  prescription.frequencyPerDay * prescription.durationDays;

/** Issue a prescription (status `active`, no doses yet). */
export function issuePrescription(params: IssuePrescriptionParams): Prescription {
  const medication = params.medication.trim();
  if (medication.length === 0) {
    throw new EmptyMedicationError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    centreId: params.centreId,
    patientId: params.patientId,
    clinicianId: params.clinicianId,
    medication,
    dosage: params.dosage?.trim() || null,
    frequencyPerDay: requirePositiveInt(params.frequencyPerDay),
    durationDays: requirePositiveInt(params.durationDays),
    startDate: params.startDate,
    dosesAdministered: 0,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (prescription: Prescription, patch: Partial<Prescription>): Prescription => ({
  ...prescription,
  ...patch,
  updatedAt: nowIso(),
});

/** Record `count` doses administered (default 1) against an active course, never past the total. */
export function recordDose(prescription: Prescription, count = 1): Prescription {
  if (prescription.status !== "active") {
    throw new InvalidPrescriptionTransitionError(prescription.status, "dose-recorded");
  }
  const administered = prescription.dosesAdministered + requirePositiveInt(count);
  if (administered > totalDosesOf(prescription)) {
    throw new DoseLimitReachedError(prescription.id);
  }
  return touch(prescription, { dosesAdministered: administered });
}

/** Complete a prescription course (→ `completed`). */
export function completePrescription(prescription: Prescription): Prescription {
  if (prescription.status !== "active") {
    throw new InvalidPrescriptionTransitionError(prescription.status, "completed");
  }
  return touch(prescription, { status: "completed" });
}

/** Discontinue a prescription early (→ `discontinued`). */
export function discontinuePrescription(prescription: Prescription): Prescription {
  if (prescription.status !== "active") {
    throw new InvalidPrescriptionTransitionError(prescription.status, "discontinued");
  }
  return touch(prescription, { status: "discontinued" });
}

/** Whether the prescription course is still active. */
export const isPrescriptionActive = (prescription: Prescription): boolean =>
  prescription.status === "active";
