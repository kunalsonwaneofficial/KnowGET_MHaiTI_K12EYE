import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { Hostel } from "./hostel";
import type { Warden } from "./warden";

// --- Hostel ----------------------------------------------------------------------
export const HOSTEL_REGISTERED = "residential.hostel.registered";
export const HOSTEL_WARDEN_ASSIGNED = "residential.hostel.warden_assigned";
export const HOSTEL_SENT_TO_MAINTENANCE = "residential.hostel.sent_to_maintenance";
export const HOSTEL_RETURNED_FROM_MAINTENANCE = "residential.hostel.returned_from_maintenance";
export const HOSTEL_DECOMMISSIONED = "residential.hostel.decommissioned";

export interface HostelEventPayload {
  readonly hostelId: Uuid;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly wardenId: Uuid | null;
  readonly status: string;
}

export type HostelRegisteredEvent = DomainEvent<typeof HOSTEL_REGISTERED, HostelEventPayload>;
export type HostelWardenAssignedEvent = DomainEvent<
  typeof HOSTEL_WARDEN_ASSIGNED,
  HostelEventPayload
>;
export type HostelSentToMaintenanceEvent = DomainEvent<
  typeof HOSTEL_SENT_TO_MAINTENANCE,
  HostelEventPayload
>;
export type HostelReturnedFromMaintenanceEvent = DomainEvent<
  typeof HOSTEL_RETURNED_FROM_MAINTENANCE,
  HostelEventPayload
>;
export type HostelDecommissionedEvent = DomainEvent<
  typeof HOSTEL_DECOMMISSIONED,
  HostelEventPayload
>;

const hostelPayload = (hostel: Hostel): HostelEventPayload => ({
  hostelId: hostel.id,
  organizationId: hostel.organizationId,
  code: hostel.code,
  wardenId: hostel.wardenId,
  status: hostel.status,
});

export const hostelRegistered = (hostel: Hostel): HostelRegisteredEvent =>
  createEvent(HOSTEL_REGISTERED, hostelPayload(hostel), { tenantId: hostel.tenantId });

export const hostelWardenAssigned = (hostel: Hostel): HostelWardenAssignedEvent =>
  createEvent(HOSTEL_WARDEN_ASSIGNED, hostelPayload(hostel), { tenantId: hostel.tenantId });

export const hostelSentToMaintenance = (hostel: Hostel): HostelSentToMaintenanceEvent =>
  createEvent(HOSTEL_SENT_TO_MAINTENANCE, hostelPayload(hostel), { tenantId: hostel.tenantId });

export const hostelReturnedFromMaintenance = (hostel: Hostel): HostelReturnedFromMaintenanceEvent =>
  createEvent(HOSTEL_RETURNED_FROM_MAINTENANCE, hostelPayload(hostel), {
    tenantId: hostel.tenantId,
  });

export const hostelDecommissioned = (hostel: Hostel): HostelDecommissionedEvent =>
  createEvent(HOSTEL_DECOMMISSIONED, hostelPayload(hostel), { tenantId: hostel.tenantId });

// --- Warden ----------------------------------------------------------------------
export const WARDEN_REGISTERED = "residential.warden.registered";
export const WARDEN_SUSPENDED = "residential.warden.suspended";
export const WARDEN_REINSTATED = "residential.warden.reinstated";
export const WARDEN_RELIEVED = "residential.warden.relieved";

export interface WardenEventPayload {
  readonly wardenId: Uuid;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
  readonly status: string;
}

export type WardenRegisteredEvent = DomainEvent<typeof WARDEN_REGISTERED, WardenEventPayload>;
export type WardenSuspendedEvent = DomainEvent<typeof WARDEN_SUSPENDED, WardenEventPayload>;
export type WardenReinstatedEvent = DomainEvent<typeof WARDEN_REINSTATED, WardenEventPayload>;
export type WardenRelievedEvent = DomainEvent<typeof WARDEN_RELIEVED, WardenEventPayload>;

const wardenPayload = (warden: Warden): WardenEventPayload => ({
  wardenId: warden.id,
  organizationId: warden.organizationId,
  employeeId: warden.employeeId,
  status: warden.status,
});

export const wardenRegistered = (warden: Warden): WardenRegisteredEvent =>
  createEvent(WARDEN_REGISTERED, wardenPayload(warden), { tenantId: warden.tenantId });

export const wardenSuspended = (warden: Warden): WardenSuspendedEvent =>
  createEvent(WARDEN_SUSPENDED, wardenPayload(warden), { tenantId: warden.tenantId });

export const wardenReinstated = (warden: Warden): WardenReinstatedEvent =>
  createEvent(WARDEN_REINSTATED, wardenPayload(warden), { tenantId: warden.tenantId });

export const wardenRelieved = (warden: Warden): WardenRelievedEvent =>
  createEvent(WARDEN_RELIEVED, wardenPayload(warden), { tenantId: warden.tenantId });
