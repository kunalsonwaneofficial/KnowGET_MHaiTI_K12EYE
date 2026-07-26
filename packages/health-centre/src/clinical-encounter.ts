import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EncounterClinicianRequiredError, InvalidEncounterTransitionError } from "./errors";
import type { EncounterDisposition, EncounterStatus, TriageAcuity } from "./health-centre-value";

/**
 * A clinical encounter — the record of a patient (a Person) being seen at a health centre. It carries a
 * triage acuity, an optional chief complaint and clinical assessment (free-text clinical content held on
 * the aggregate but **never** placed on a domain event), the attending clinician, and, at completion, a
 * disposition (discharged / referred / admitted / follow-up). It runs `draft → in_progress → completed`,
 * or `→ cancelled` from either open state. The organization is derived from the centre. The standing
 * health record it may inform (history, allergies, chronic conditions) belongs to Learner Wellbeing
 * (P2-D05) — the encounter is the operational event, not that record.
 */
export interface ClinicalEncounter {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly centreId: Uuid;
  readonly patientId: Uuid;
  readonly clinicianId: Uuid | null;
  readonly triageAcuity: TriageAcuity;
  readonly chiefComplaint: string | null;
  readonly assessment: string | null;
  readonly disposition: EncounterDisposition | null;
  readonly status: EncounterStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface OpenEncounterParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly centreId: Uuid;
  readonly patientId: Uuid;
  readonly triageAcuity: TriageAcuity;
  readonly chiefComplaint?: string | null;
  readonly clinicianId?: Uuid | null;
}

/** Open a clinical encounter (status `draft`, triaged and queued). */
export function openEncounter(params: OpenEncounterParams): ClinicalEncounter {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    centreId: params.centreId,
    patientId: params.patientId,
    clinicianId: params.clinicianId ?? null,
    triageAcuity: params.triageAcuity,
    chiefComplaint: params.chiefComplaint?.trim() || null,
    assessment: null,
    disposition: null,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (
  encounter: ClinicalEncounter,
  patch: Partial<ClinicalEncounter>,
): ClinicalEncounter => ({
  ...encounter,
  ...patch,
  updatedAt: nowIso(),
});

const requireOpen = (encounter: ClinicalEncounter, to: string): void => {
  if (encounter.status !== "draft" && encounter.status !== "in_progress") {
    throw new InvalidEncounterTransitionError(encounter.status, to);
  }
};

/** Set the triage acuity while the encounter is open. */
export function setTriageAcuity(
  encounter: ClinicalEncounter,
  triageAcuity: TriageAcuity,
): ClinicalEncounter {
  requireOpen(encounter, "triaged");
  return touch(encounter, { triageAcuity });
}

/** Set (or clear) the chief complaint while the encounter is open. */
export function setChiefComplaint(
  encounter: ClinicalEncounter,
  chiefComplaint: string | null,
): ClinicalEncounter {
  requireOpen(encounter, "complaint-set");
  return touch(encounter, { chiefComplaint: chiefComplaint?.trim() || null });
}

/** Assign the attending clinician (the service validates the clinician is active). */
export function assignEncounterClinician(
  encounter: ClinicalEncounter,
  clinicianId: Uuid,
): ClinicalEncounter {
  requireOpen(encounter, "clinician-assigned");
  return touch(encounter, { clinicianId });
}

/** Begin the consultation (`draft → in_progress`); a clinician must be assigned. */
export function startEncounter(encounter: ClinicalEncounter): ClinicalEncounter {
  if (encounter.status !== "draft") {
    throw new InvalidEncounterTransitionError(encounter.status, "in_progress");
  }
  if (encounter.clinicianId === null) {
    throw new EncounterClinicianRequiredError(encounter.id);
  }
  return touch(encounter, { status: "in_progress" });
}

/** Record the clinical assessment while the consultation is in progress. */
export function recordAssessment(
  encounter: ClinicalEncounter,
  assessment: string | null,
): ClinicalEncounter {
  if (encounter.status !== "in_progress") {
    throw new InvalidEncounterTransitionError(encounter.status, "assessed");
  }
  return touch(encounter, { assessment: assessment?.trim() || null });
}

/** Complete the encounter with a disposition (`in_progress → completed`). */
export function completeEncounter(
  encounter: ClinicalEncounter,
  disposition: EncounterDisposition,
): ClinicalEncounter {
  if (encounter.status !== "in_progress") {
    throw new InvalidEncounterTransitionError(encounter.status, "completed");
  }
  return touch(encounter, { status: "completed", disposition });
}

/** Cancel an open encounter (→ `cancelled`). */
export function cancelEncounter(encounter: ClinicalEncounter): ClinicalEncounter {
  requireOpen(encounter, "cancelled");
  return touch(encounter, { status: "cancelled" });
}

/** Whether the encounter is still open (draft or in progress). */
export const isEncounterOpen = (encounter: ClinicalEncounter): boolean =>
  encounter.status === "draft" || encounter.status === "in_progress";
