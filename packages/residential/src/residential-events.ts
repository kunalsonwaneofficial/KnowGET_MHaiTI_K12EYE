import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { BedAllocation } from "./bed-allocation";
import type { Hostel } from "./hostel";
import type { Room } from "./room";
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

// --- Room ------------------------------------------------------------------------
export const ROOM_DRAFTED = "residential.room.drafted";
export const ROOM_MADE_AVAILABLE = "residential.room.made_available";
export const ROOM_SENT_TO_MAINTENANCE = "residential.room.sent_to_maintenance";
export const ROOM_RETURNED_FROM_MAINTENANCE = "residential.room.returned_from_maintenance";
export const ROOM_DECOMMISSIONED = "residential.room.decommissioned";

export interface RoomEventPayload {
  readonly roomId: Uuid;
  readonly organizationId: Uuid;
  readonly hostelId: Uuid;
  readonly roomNumber: string;
  readonly bedCount: number;
  readonly status: string;
}

export type RoomDraftedEvent = DomainEvent<typeof ROOM_DRAFTED, RoomEventPayload>;
export type RoomMadeAvailableEvent = DomainEvent<typeof ROOM_MADE_AVAILABLE, RoomEventPayload>;
export type RoomSentToMaintenanceEvent = DomainEvent<
  typeof ROOM_SENT_TO_MAINTENANCE,
  RoomEventPayload
>;
export type RoomReturnedFromMaintenanceEvent = DomainEvent<
  typeof ROOM_RETURNED_FROM_MAINTENANCE,
  RoomEventPayload
>;
export type RoomDecommissionedEvent = DomainEvent<typeof ROOM_DECOMMISSIONED, RoomEventPayload>;

const roomPayload = (room: Room): RoomEventPayload => ({
  roomId: room.id,
  organizationId: room.organizationId,
  hostelId: room.hostelId,
  roomNumber: room.roomNumber,
  bedCount: room.beds.length,
  status: room.status,
});

export const roomDrafted = (room: Room): RoomDraftedEvent =>
  createEvent(ROOM_DRAFTED, roomPayload(room), { tenantId: room.tenantId });

export const roomMadeAvailable = (room: Room): RoomMadeAvailableEvent =>
  createEvent(ROOM_MADE_AVAILABLE, roomPayload(room), { tenantId: room.tenantId });

export const roomSentToMaintenance = (room: Room): RoomSentToMaintenanceEvent =>
  createEvent(ROOM_SENT_TO_MAINTENANCE, roomPayload(room), { tenantId: room.tenantId });

export const roomReturnedFromMaintenance = (room: Room): RoomReturnedFromMaintenanceEvent =>
  createEvent(ROOM_RETURNED_FROM_MAINTENANCE, roomPayload(room), { tenantId: room.tenantId });

export const roomDecommissioned = (room: Room): RoomDecommissionedEvent =>
  createEvent(ROOM_DECOMMISSIONED, roomPayload(room), { tenantId: room.tenantId });

// --- Bed allocation --------------------------------------------------------------
export const ALLOCATION_CREATED = "residential.allocation.created";
export const ALLOCATION_ENDED = "residential.allocation.ended";

export interface AllocationEventPayload {
  readonly allocationId: Uuid;
  readonly organizationId: Uuid;
  readonly hostelId: Uuid;
  readonly roomId: Uuid;
  readonly bedKey: string;
  readonly studentId: Uuid;
  readonly status: string;
}

export type AllocationCreatedEvent = DomainEvent<typeof ALLOCATION_CREATED, AllocationEventPayload>;
export type AllocationEndedEvent = DomainEvent<typeof ALLOCATION_ENDED, AllocationEventPayload>;

const allocationPayload = (allocation: BedAllocation): AllocationEventPayload => ({
  allocationId: allocation.id,
  organizationId: allocation.organizationId,
  hostelId: allocation.hostelId,
  roomId: allocation.roomId,
  bedKey: allocation.bedKey,
  studentId: allocation.studentId,
  status: allocation.status,
});

export const allocationCreated = (allocation: BedAllocation): AllocationCreatedEvent =>
  createEvent(ALLOCATION_CREATED, allocationPayload(allocation), { tenantId: allocation.tenantId });

export const allocationEnded = (allocation: BedAllocation): AllocationEndedEvent =>
  createEvent(ALLOCATION_ENDED, allocationPayload(allocation), { tenantId: allocation.tenantId });
