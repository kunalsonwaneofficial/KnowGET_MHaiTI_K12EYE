/**
 * Value objects for the Integrated Health Centre & Clinical Services Platform (P2-D19). Every clinically
 * meaningful set is a closed string-literal union backed by a `readonly` tuple, so the domain, the DTOs and
 * the database agree on the same vocabulary. Nothing here is money — clinical services are not billed in
 * this domain (Finance, P2-D14) and medical supplies are not stocked here (Procurement/Assets, P2-D15).
 */

/** The kind of health facility a centre is. */
export const CENTRE_TYPES = ["infirmary", "clinic", "dental", "counselling", "wellness"] as const;
export type CentreType = (typeof CENTRE_TYPES)[number];

/** A health centre's lifecycle — operational, temporarily closed, or permanently retired. */
export const CENTRE_STATUSES = ["active", "under_maintenance", "decommissioned"] as const;
export type CentreStatus = (typeof CENTRE_STATUSES)[number];

/** The clinical role a clinician holds (they are a validated Employee, P2-D12). */
export const CLINICIAN_ROLES = [
  "physician",
  "nurse",
  "dentist",
  "paramedic",
  "pharmacist",
  "psychologist",
] as const;
export type ClinicianRole = (typeof CLINICIAN_ROLES)[number];

/** A clinician's lifecycle — practising, suspended, or relieved of the clinical role. */
export const CLINICIAN_STATUSES = ["active", "suspended", "relieved"] as const;
export type ClinicianStatus = (typeof CLINICIAN_STATUSES)[number];

/** An appointment's lifecycle. */
export const APPOINTMENT_STATUSES = [
  "requested",
  "scheduled",
  "checked_in",
  "completed",
  "cancelled",
  "no_show",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** The non-terminal appointment statuses — an "open" appointment still on the books. */
export const OPEN_APPOINTMENT_STATUSES = ["requested", "scheduled", "checked_in"] as const;

/** Triage acuity — how quickly a presenting patient needs to be seen. */
export const TRIAGE_ACUITIES = ["routine", "urgent", "emergency"] as const;
export type TriageAcuity = (typeof TRIAGE_ACUITIES)[number];

/** A clinical encounter's lifecycle. */
export const ENCOUNTER_STATUSES = ["draft", "in_progress", "completed", "cancelled"] as const;
export type EncounterStatus = (typeof ENCOUNTER_STATUSES)[number];

/** How an encounter is disposed of once the clinician has seen the patient. */
export const ENCOUNTER_DISPOSITIONS = ["discharged", "referred", "admitted", "follow_up"] as const;
export type EncounterDisposition = (typeof ENCOUNTER_DISPOSITIONS)[number];

/** A prescription's lifecycle — a running course, completed, or stopped early. */
export const PRESCRIPTION_STATUSES = ["active", "completed", "discontinued"] as const;
export type PrescriptionStatus = (typeof PRESCRIPTION_STATUSES)[number];

/** A sick-bay admission's lifecycle — a patient under observation, then discharged. */
export const ADMISSION_STATUSES = ["active", "discharged"] as const;
export type AdmissionStatus = (typeof ADMISSION_STATUSES)[number];

/** A referral's lifecycle to an external provider. */
export const REFERRAL_STATUSES = ["raised", "accepted", "completed", "cancelled"] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

/** The non-terminal referral statuses — an "open" referral still in flight. */
export const OPEN_REFERRAL_STATUSES = ["raised", "accepted"] as const;

/** How urgently a referral needs the external provider to act. */
export const REFERRAL_URGENCIES = ["routine", "urgent", "emergency"] as const;
export type ReferralUrgency = (typeof REFERRAL_URGENCIES)[number];
