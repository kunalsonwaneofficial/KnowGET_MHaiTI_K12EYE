import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { Appointment } from "./appointment";
import type { ClinicalEncounter } from "./clinical-encounter";
import type { Clinician } from "./clinician";
import type { CentreProfile } from "./centre-profile";
import type { HealthCentre } from "./health-centre";
import type { Prescription } from "./prescription";
import type { Referral } from "./referral";
import type { SickBayAdmission } from "./sick-bay-admission";

/**
 * Domain events for the Integrated Health Centre & Clinical Services Platform (P2-D19), on the `clinical.*`
 * namespace. Every payload is **content-free**: it carries ids, non-sensitive metadata (a centre code, a
 * clinician's job role, a status) and counts — never a chief complaint, diagnosis, drug name or any other
 * clinical detail. The confidentiality of clinical information is held at the event boundary, the same
 * discipline Learner Wellbeing (P2-D05) applies to counselling and safeguarding.
 */

// --- Health centre ---------------------------------------------------------------
export const CENTRE_REGISTERED = "clinical.centre.registered";
export const CENTRE_RENAMED = "clinical.centre.renamed";
export const CENTRE_CAPACITY_SET = "clinical.centre.capacity_set";
export const CENTRE_LEAD_ASSIGNED = "clinical.centre.lead_assigned";
export const CENTRE_LEAD_UNASSIGNED = "clinical.centre.lead_unassigned";
export const CENTRE_SENT_TO_MAINTENANCE = "clinical.centre.sent_to_maintenance";
export const CENTRE_RETURNED_FROM_MAINTENANCE = "clinical.centre.returned_from_maintenance";
export const CENTRE_DECOMMISSIONED = "clinical.centre.decommissioned";

export interface CentreEventPayload {
  readonly centreId: Uuid;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly type: string;
  readonly sickBayCapacity: number;
  readonly leadClinicianId: Uuid | null;
  readonly status: string;
}

export type CentreRegisteredEvent = DomainEvent<typeof CENTRE_REGISTERED, CentreEventPayload>;
export type CentreRenamedEvent = DomainEvent<typeof CENTRE_RENAMED, CentreEventPayload>;
export type CentreCapacitySetEvent = DomainEvent<typeof CENTRE_CAPACITY_SET, CentreEventPayload>;
export type CentreLeadAssignedEvent = DomainEvent<typeof CENTRE_LEAD_ASSIGNED, CentreEventPayload>;
export type CentreLeadUnassignedEvent = DomainEvent<
  typeof CENTRE_LEAD_UNASSIGNED,
  CentreEventPayload
>;
export type CentreSentToMaintenanceEvent = DomainEvent<
  typeof CENTRE_SENT_TO_MAINTENANCE,
  CentreEventPayload
>;
export type CentreReturnedFromMaintenanceEvent = DomainEvent<
  typeof CENTRE_RETURNED_FROM_MAINTENANCE,
  CentreEventPayload
>;
export type CentreDecommissionedEvent = DomainEvent<
  typeof CENTRE_DECOMMISSIONED,
  CentreEventPayload
>;

const centrePayload = (centre: HealthCentre): CentreEventPayload => ({
  centreId: centre.id,
  organizationId: centre.organizationId,
  code: centre.code,
  type: centre.type,
  sickBayCapacity: centre.sickBayCapacity,
  leadClinicianId: centre.leadClinicianId,
  status: centre.status,
});

export const centreRegistered = (centre: HealthCentre): CentreRegisteredEvent =>
  createEvent(CENTRE_REGISTERED, centrePayload(centre), { tenantId: centre.tenantId });
export const centreRenamed = (centre: HealthCentre): CentreRenamedEvent =>
  createEvent(CENTRE_RENAMED, centrePayload(centre), { tenantId: centre.tenantId });
export const centreCapacitySet = (centre: HealthCentre): CentreCapacitySetEvent =>
  createEvent(CENTRE_CAPACITY_SET, centrePayload(centre), { tenantId: centre.tenantId });
export const centreLeadAssigned = (centre: HealthCentre): CentreLeadAssignedEvent =>
  createEvent(CENTRE_LEAD_ASSIGNED, centrePayload(centre), { tenantId: centre.tenantId });
export const centreLeadUnassigned = (centre: HealthCentre): CentreLeadUnassignedEvent =>
  createEvent(CENTRE_LEAD_UNASSIGNED, centrePayload(centre), { tenantId: centre.tenantId });
export const centreSentToMaintenance = (centre: HealthCentre): CentreSentToMaintenanceEvent =>
  createEvent(CENTRE_SENT_TO_MAINTENANCE, centrePayload(centre), { tenantId: centre.tenantId });
export const centreReturnedFromMaintenance = (
  centre: HealthCentre,
): CentreReturnedFromMaintenanceEvent =>
  createEvent(CENTRE_RETURNED_FROM_MAINTENANCE, centrePayload(centre), {
    tenantId: centre.tenantId,
  });
export const centreDecommissioned = (centre: HealthCentre): CentreDecommissionedEvent =>
  createEvent(CENTRE_DECOMMISSIONED, centrePayload(centre), { tenantId: centre.tenantId });

// --- Clinician -------------------------------------------------------------------
export const CLINICIAN_REGISTERED = "clinical.clinician.registered";
export const CLINICIAN_ROLE_SET = "clinical.clinician.role_set";
export const CLINICIAN_REGISTRATION_SET = "clinical.clinician.registration_set";
export const CLINICIAN_SUSPENDED = "clinical.clinician.suspended";
export const CLINICIAN_REINSTATED = "clinical.clinician.reinstated";
export const CLINICIAN_RELIEVED = "clinical.clinician.relieved";

export interface ClinicianEventPayload {
  readonly clinicianId: Uuid;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
  readonly role: string;
  readonly status: string;
}

export type ClinicianRegisteredEvent = DomainEvent<
  typeof CLINICIAN_REGISTERED,
  ClinicianEventPayload
>;
export type ClinicianRoleSetEvent = DomainEvent<typeof CLINICIAN_ROLE_SET, ClinicianEventPayload>;
export type ClinicianRegistrationSetEvent = DomainEvent<
  typeof CLINICIAN_REGISTRATION_SET,
  ClinicianEventPayload
>;
export type ClinicianSuspendedEvent = DomainEvent<
  typeof CLINICIAN_SUSPENDED,
  ClinicianEventPayload
>;
export type ClinicianReinstatedEvent = DomainEvent<
  typeof CLINICIAN_REINSTATED,
  ClinicianEventPayload
>;
export type ClinicianRelievedEvent = DomainEvent<typeof CLINICIAN_RELIEVED, ClinicianEventPayload>;

const clinicianPayload = (clinician: Clinician): ClinicianEventPayload => ({
  clinicianId: clinician.id,
  organizationId: clinician.organizationId,
  employeeId: clinician.employeeId,
  role: clinician.role,
  status: clinician.status,
});

export const clinicianRegistered = (clinician: Clinician): ClinicianRegisteredEvent =>
  createEvent(CLINICIAN_REGISTERED, clinicianPayload(clinician), { tenantId: clinician.tenantId });
export const clinicianRoleSet = (clinician: Clinician): ClinicianRoleSetEvent =>
  createEvent(CLINICIAN_ROLE_SET, clinicianPayload(clinician), { tenantId: clinician.tenantId });
export const clinicianRegistrationSet = (clinician: Clinician): ClinicianRegistrationSetEvent =>
  createEvent(CLINICIAN_REGISTRATION_SET, clinicianPayload(clinician), {
    tenantId: clinician.tenantId,
  });
export const clinicianSuspended = (clinician: Clinician): ClinicianSuspendedEvent =>
  createEvent(CLINICIAN_SUSPENDED, clinicianPayload(clinician), { tenantId: clinician.tenantId });
export const clinicianReinstated = (clinician: Clinician): ClinicianReinstatedEvent =>
  createEvent(CLINICIAN_REINSTATED, clinicianPayload(clinician), { tenantId: clinician.tenantId });
export const clinicianRelieved = (clinician: Clinician): ClinicianRelievedEvent =>
  createEvent(CLINICIAN_RELIEVED, clinicianPayload(clinician), { tenantId: clinician.tenantId });

// --- Appointment -----------------------------------------------------------------
export const APPOINTMENT_REQUESTED = "clinical.appointment.requested";
export const APPOINTMENT_SCHEDULED = "clinical.appointment.scheduled";
export const APPOINTMENT_RESCHEDULED = "clinical.appointment.rescheduled";
export const APPOINTMENT_CHECKED_IN = "clinical.appointment.checked_in";
export const APPOINTMENT_COMPLETED = "clinical.appointment.completed";
export const APPOINTMENT_CANCELLED = "clinical.appointment.cancelled";
export const APPOINTMENT_NO_SHOW = "clinical.appointment.no_show";

export interface AppointmentEventPayload {
  readonly appointmentId: Uuid;
  readonly centreId: Uuid;
  readonly organizationId: Uuid;
  readonly patientId: Uuid;
  readonly clinicianId: Uuid | null;
  readonly scheduledFor: string;
  readonly status: string;
}

export type AppointmentRequestedEvent = DomainEvent<
  typeof APPOINTMENT_REQUESTED,
  AppointmentEventPayload
>;
export type AppointmentScheduledEvent = DomainEvent<
  typeof APPOINTMENT_SCHEDULED,
  AppointmentEventPayload
>;
export type AppointmentRescheduledEvent = DomainEvent<
  typeof APPOINTMENT_RESCHEDULED,
  AppointmentEventPayload
>;
export type AppointmentCheckedInEvent = DomainEvent<
  typeof APPOINTMENT_CHECKED_IN,
  AppointmentEventPayload
>;
export type AppointmentCompletedEvent = DomainEvent<
  typeof APPOINTMENT_COMPLETED,
  AppointmentEventPayload
>;
export type AppointmentCancelledEvent = DomainEvent<
  typeof APPOINTMENT_CANCELLED,
  AppointmentEventPayload
>;
export type AppointmentNoShowEvent = DomainEvent<
  typeof APPOINTMENT_NO_SHOW,
  AppointmentEventPayload
>;

const appointmentPayload = (appt: Appointment): AppointmentEventPayload => ({
  appointmentId: appt.id,
  centreId: appt.centreId,
  organizationId: appt.organizationId,
  patientId: appt.patientId,
  clinicianId: appt.clinicianId,
  scheduledFor: appt.scheduledFor,
  status: appt.status,
});

export const appointmentRequested = (appt: Appointment): AppointmentRequestedEvent =>
  createEvent(APPOINTMENT_REQUESTED, appointmentPayload(appt), { tenantId: appt.tenantId });
export const appointmentScheduled = (appt: Appointment): AppointmentScheduledEvent =>
  createEvent(APPOINTMENT_SCHEDULED, appointmentPayload(appt), { tenantId: appt.tenantId });
export const appointmentRescheduled = (appt: Appointment): AppointmentRescheduledEvent =>
  createEvent(APPOINTMENT_RESCHEDULED, appointmentPayload(appt), { tenantId: appt.tenantId });
export const appointmentCheckedIn = (appt: Appointment): AppointmentCheckedInEvent =>
  createEvent(APPOINTMENT_CHECKED_IN, appointmentPayload(appt), { tenantId: appt.tenantId });
export const appointmentCompleted = (appt: Appointment): AppointmentCompletedEvent =>
  createEvent(APPOINTMENT_COMPLETED, appointmentPayload(appt), { tenantId: appt.tenantId });
export const appointmentCancelled = (appt: Appointment): AppointmentCancelledEvent =>
  createEvent(APPOINTMENT_CANCELLED, appointmentPayload(appt), { tenantId: appt.tenantId });
export const appointmentNoShow = (appt: Appointment): AppointmentNoShowEvent =>
  createEvent(APPOINTMENT_NO_SHOW, appointmentPayload(appt), { tenantId: appt.tenantId });

// --- Clinical encounter ----------------------------------------------------------
// Content-free: an encounter event carries ids and a status only — never the chief complaint, the
// assessment, the triage acuity or the disposition. Downstream reactors query for detail under permission.
export const ENCOUNTER_OPENED = "clinical.encounter.opened";
export const ENCOUNTER_CLINICIAN_ASSIGNED = "clinical.encounter.clinician_assigned";
export const ENCOUNTER_STARTED = "clinical.encounter.started";
export const ENCOUNTER_COMPLETED = "clinical.encounter.completed";
export const ENCOUNTER_CANCELLED = "clinical.encounter.cancelled";

export interface EncounterEventPayload {
  readonly encounterId: Uuid;
  readonly centreId: Uuid;
  readonly organizationId: Uuid;
  readonly patientId: Uuid;
  readonly clinicianId: Uuid | null;
  readonly status: string;
}

export type EncounterOpenedEvent = DomainEvent<typeof ENCOUNTER_OPENED, EncounterEventPayload>;
export type EncounterClinicianAssignedEvent = DomainEvent<
  typeof ENCOUNTER_CLINICIAN_ASSIGNED,
  EncounterEventPayload
>;
export type EncounterStartedEvent = DomainEvent<typeof ENCOUNTER_STARTED, EncounterEventPayload>;
export type EncounterCompletedEvent = DomainEvent<
  typeof ENCOUNTER_COMPLETED,
  EncounterEventPayload
>;
export type EncounterCancelledEvent = DomainEvent<
  typeof ENCOUNTER_CANCELLED,
  EncounterEventPayload
>;

const encounterPayload = (encounter: ClinicalEncounter): EncounterEventPayload => ({
  encounterId: encounter.id,
  centreId: encounter.centreId,
  organizationId: encounter.organizationId,
  patientId: encounter.patientId,
  clinicianId: encounter.clinicianId,
  status: encounter.status,
});

export const encounterOpened = (encounter: ClinicalEncounter): EncounterOpenedEvent =>
  createEvent(ENCOUNTER_OPENED, encounterPayload(encounter), { tenantId: encounter.tenantId });
export const encounterClinicianAssigned = (
  encounter: ClinicalEncounter,
): EncounterClinicianAssignedEvent =>
  createEvent(ENCOUNTER_CLINICIAN_ASSIGNED, encounterPayload(encounter), {
    tenantId: encounter.tenantId,
  });
export const encounterStarted = (encounter: ClinicalEncounter): EncounterStartedEvent =>
  createEvent(ENCOUNTER_STARTED, encounterPayload(encounter), { tenantId: encounter.tenantId });
export const encounterCompleted = (encounter: ClinicalEncounter): EncounterCompletedEvent =>
  createEvent(ENCOUNTER_COMPLETED, encounterPayload(encounter), { tenantId: encounter.tenantId });
export const encounterCancelled = (encounter: ClinicalEncounter): EncounterCancelledEvent =>
  createEvent(ENCOUNTER_CANCELLED, encounterPayload(encounter), { tenantId: encounter.tenantId });

// --- Prescription ----------------------------------------------------------------
// Content-free: a prescription event carries ids, the prescriber, a dose count and a status — never the
// medication or dosage.
export const PRESCRIPTION_ISSUED = "clinical.prescription.issued";
export const PRESCRIPTION_DOSE_RECORDED = "clinical.prescription.dose_recorded";
export const PRESCRIPTION_COMPLETED = "clinical.prescription.completed";
export const PRESCRIPTION_DISCONTINUED = "clinical.prescription.discontinued";

export interface PrescriptionEventPayload {
  readonly prescriptionId: Uuid;
  readonly centreId: Uuid;
  readonly organizationId: Uuid;
  readonly patientId: Uuid;
  readonly clinicianId: Uuid;
  readonly dosesAdministered: number;
  readonly status: string;
}

export type PrescriptionIssuedEvent = DomainEvent<
  typeof PRESCRIPTION_ISSUED,
  PrescriptionEventPayload
>;
export type PrescriptionDoseRecordedEvent = DomainEvent<
  typeof PRESCRIPTION_DOSE_RECORDED,
  PrescriptionEventPayload
>;
export type PrescriptionCompletedEvent = DomainEvent<
  typeof PRESCRIPTION_COMPLETED,
  PrescriptionEventPayload
>;
export type PrescriptionDiscontinuedEvent = DomainEvent<
  typeof PRESCRIPTION_DISCONTINUED,
  PrescriptionEventPayload
>;

const prescriptionPayload = (prescription: Prescription): PrescriptionEventPayload => ({
  prescriptionId: prescription.id,
  centreId: prescription.centreId,
  organizationId: prescription.organizationId,
  patientId: prescription.patientId,
  clinicianId: prescription.clinicianId,
  dosesAdministered: prescription.dosesAdministered,
  status: prescription.status,
});

export const prescriptionIssued = (prescription: Prescription): PrescriptionIssuedEvent =>
  createEvent(PRESCRIPTION_ISSUED, prescriptionPayload(prescription), {
    tenantId: prescription.tenantId,
  });
export const prescriptionDoseRecorded = (
  prescription: Prescription,
): PrescriptionDoseRecordedEvent =>
  createEvent(PRESCRIPTION_DOSE_RECORDED, prescriptionPayload(prescription), {
    tenantId: prescription.tenantId,
  });
export const prescriptionCompleted = (prescription: Prescription): PrescriptionCompletedEvent =>
  createEvent(PRESCRIPTION_COMPLETED, prescriptionPayload(prescription), {
    tenantId: prescription.tenantId,
  });
export const prescriptionDiscontinued = (
  prescription: Prescription,
): PrescriptionDiscontinuedEvent =>
  createEvent(PRESCRIPTION_DISCONTINUED, prescriptionPayload(prescription), {
    tenantId: prescription.tenantId,
  });

// --- Sick-bay admission ----------------------------------------------------------
export const ADMISSION_OPENED = "clinical.admission.opened";
export const ADMISSION_DISCHARGED = "clinical.admission.discharged";

export interface AdmissionEventPayload {
  readonly admissionId: Uuid;
  readonly centreId: Uuid;
  readonly organizationId: Uuid;
  readonly patientId: Uuid;
  readonly bedLabel: string;
  readonly status: string;
}

export type AdmissionOpenedEvent = DomainEvent<typeof ADMISSION_OPENED, AdmissionEventPayload>;
export type AdmissionDischargedEvent = DomainEvent<
  typeof ADMISSION_DISCHARGED,
  AdmissionEventPayload
>;

const admissionPayload = (admission: SickBayAdmission): AdmissionEventPayload => ({
  admissionId: admission.id,
  centreId: admission.centreId,
  organizationId: admission.organizationId,
  patientId: admission.patientId,
  bedLabel: admission.bedLabel,
  status: admission.status,
});

export const admissionOpened = (admission: SickBayAdmission): AdmissionOpenedEvent =>
  createEvent(ADMISSION_OPENED, admissionPayload(admission), { tenantId: admission.tenantId });
export const admissionDischarged = (admission: SickBayAdmission): AdmissionDischargedEvent =>
  createEvent(ADMISSION_DISCHARGED, admissionPayload(admission), { tenantId: admission.tenantId });

// --- Referral --------------------------------------------------------------------
// Content-free: a referral event carries ids, the referrer, an urgency and a status — never the reason or
// the external target detail.
export const REFERRAL_RAISED = "clinical.referral.raised";
export const REFERRAL_ACCEPTED = "clinical.referral.accepted";
export const REFERRAL_COMPLETED = "clinical.referral.completed";
export const REFERRAL_CANCELLED = "clinical.referral.cancelled";

export interface ReferralEventPayload {
  readonly referralId: Uuid;
  readonly centreId: Uuid;
  readonly organizationId: Uuid;
  readonly patientId: Uuid;
  readonly clinicianId: Uuid | null;
  readonly urgency: string;
  readonly status: string;
}

export type ReferralRaisedEvent = DomainEvent<typeof REFERRAL_RAISED, ReferralEventPayload>;
export type ReferralAcceptedEvent = DomainEvent<typeof REFERRAL_ACCEPTED, ReferralEventPayload>;
export type ReferralCompletedEvent = DomainEvent<typeof REFERRAL_COMPLETED, ReferralEventPayload>;
export type ReferralCancelledEvent = DomainEvent<typeof REFERRAL_CANCELLED, ReferralEventPayload>;

const referralPayload = (referral: Referral): ReferralEventPayload => ({
  referralId: referral.id,
  centreId: referral.centreId,
  organizationId: referral.organizationId,
  patientId: referral.patientId,
  clinicianId: referral.clinicianId,
  urgency: referral.urgency,
  status: referral.status,
});

export const referralRaised = (referral: Referral): ReferralRaisedEvent =>
  createEvent(REFERRAL_RAISED, referralPayload(referral), { tenantId: referral.tenantId });
export const referralAccepted = (referral: Referral): ReferralAcceptedEvent =>
  createEvent(REFERRAL_ACCEPTED, referralPayload(referral), { tenantId: referral.tenantId });
export const referralCompleted = (referral: Referral): ReferralCompletedEvent =>
  createEvent(REFERRAL_COMPLETED, referralPayload(referral), { tenantId: referral.tenantId });
export const referralCancelled = (referral: Referral): ReferralCancelledEvent =>
  createEvent(REFERRAL_CANCELLED, referralPayload(referral), { tenantId: referral.tenantId });

// --- Centre profile --------------------------------------------------------------
export const CENTRE_PROFILE_REFRESHED = "clinical.centre_profile.refreshed";

export interface CentreProfileEventPayload {
  readonly profileId: Uuid;
  readonly centreId: Uuid;
  readonly organizationId: Uuid;
  readonly activeAdmissionCount: number;
  readonly occupancyPercent: number;
  readonly version: number;
}

export type CentreProfileRefreshedEvent = DomainEvent<
  typeof CENTRE_PROFILE_REFRESHED,
  CentreProfileEventPayload
>;

export const centreProfileRefreshed = (profile: CentreProfile): CentreProfileRefreshedEvent =>
  createEvent(
    CENTRE_PROFILE_REFRESHED,
    {
      profileId: profile.id,
      centreId: profile.centreId,
      organizationId: profile.organizationId,
      activeAdmissionCount: profile.activeAdmissionCount,
      occupancyPercent: profile.occupancyPercent,
      version: profile.version,
    },
    { tenantId: profile.tenantId },
  );
