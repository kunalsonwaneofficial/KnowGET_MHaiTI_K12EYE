import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { Clinician } from "./clinician";
import type { HealthCentre } from "./health-centre";

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
