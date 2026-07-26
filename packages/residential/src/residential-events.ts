import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { BedAllocation } from "./bed-allocation";
import type { Hostel } from "./hostel";
import type { HostelInspection } from "./hostel-inspection";
import type { HostelOccupancyProfile } from "./hostel-occupancy-profile";
import type { Outpass } from "./outpass";
import type { RollCall } from "./roll-call-session";
import { rollCallSummary } from "./roll-call-session";
import type { Room } from "./room";
import type { Warden } from "./warden";

// --- Hostel ----------------------------------------------------------------------
export const HOSTEL_REGISTERED = "residential.hostel.registered";
export const HOSTEL_WARDEN_ASSIGNED = "residential.hostel.warden_assigned";
export const HOSTEL_WARDEN_UNASSIGNED = "residential.hostel.warden_unassigned";
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
export type HostelWardenUnassignedEvent = DomainEvent<
  typeof HOSTEL_WARDEN_UNASSIGNED,
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

export const hostelWardenUnassigned = (hostel: Hostel): HostelWardenUnassignedEvent =>
  createEvent(HOSTEL_WARDEN_UNASSIGNED, hostelPayload(hostel), { tenantId: hostel.tenantId });

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

// --- Outpass ---------------------------------------------------------------------
export const OUTPASS_REQUESTED = "residential.outpass.requested";
export const OUTPASS_APPROVED = "residential.outpass.approved";
export const OUTPASS_REJECTED = "residential.outpass.rejected";
export const OUTPASS_CHECKED_OUT = "residential.outpass.checked_out";
export const OUTPASS_RETURNED = "residential.outpass.returned";
export const OUTPASS_CANCELLED = "residential.outpass.cancelled";

export interface OutpassEventPayload {
  readonly outpassId: Uuid;
  readonly organizationId: Uuid;
  readonly hostelId: Uuid;
  readonly studentId: Uuid;
  readonly type: string;
  readonly status: string;
}

export type OutpassRequestedEvent = DomainEvent<typeof OUTPASS_REQUESTED, OutpassEventPayload>;
export type OutpassApprovedEvent = DomainEvent<typeof OUTPASS_APPROVED, OutpassEventPayload>;
export type OutpassRejectedEvent = DomainEvent<typeof OUTPASS_REJECTED, OutpassEventPayload>;
export type OutpassCheckedOutEvent = DomainEvent<typeof OUTPASS_CHECKED_OUT, OutpassEventPayload>;
export type OutpassReturnedEvent = DomainEvent<typeof OUTPASS_RETURNED, OutpassEventPayload>;
export type OutpassCancelledEvent = DomainEvent<typeof OUTPASS_CANCELLED, OutpassEventPayload>;

const outpassPayload = (outpass: Outpass): OutpassEventPayload => ({
  outpassId: outpass.id,
  organizationId: outpass.organizationId,
  hostelId: outpass.hostelId,
  studentId: outpass.studentId,
  type: outpass.type,
  status: outpass.status,
});

export const outpassRequested = (outpass: Outpass): OutpassRequestedEvent =>
  createEvent(OUTPASS_REQUESTED, outpassPayload(outpass), { tenantId: outpass.tenantId });

export const outpassApproved = (outpass: Outpass): OutpassApprovedEvent =>
  createEvent(OUTPASS_APPROVED, outpassPayload(outpass), { tenantId: outpass.tenantId });

export const outpassRejected = (outpass: Outpass): OutpassRejectedEvent =>
  createEvent(OUTPASS_REJECTED, outpassPayload(outpass), { tenantId: outpass.tenantId });

export const outpassCheckedOut = (outpass: Outpass): OutpassCheckedOutEvent =>
  createEvent(OUTPASS_CHECKED_OUT, outpassPayload(outpass), { tenantId: outpass.tenantId });

export const outpassReturned = (outpass: Outpass): OutpassReturnedEvent =>
  createEvent(OUTPASS_RETURNED, outpassPayload(outpass), { tenantId: outpass.tenantId });

export const outpassCancelled = (outpass: Outpass): OutpassCancelledEvent =>
  createEvent(OUTPASS_CANCELLED, outpassPayload(outpass), { tenantId: outpass.tenantId });

// --- Roll call -------------------------------------------------------------------
export const ROLL_CALL_SCHEDULED = "residential.roll_call.scheduled";
export const ROLL_CALL_STARTED = "residential.roll_call.started";
export const ROLL_CALL_COMPLETED = "residential.roll_call.completed";
export const ROLL_CALL_CANCELLED = "residential.roll_call.cancelled";

export interface RollCallEventPayload {
  readonly rollCallId: Uuid;
  readonly organizationId: Uuid;
  readonly hostelId: Uuid;
  readonly status: string;
  readonly expectedCount: number;
  readonly markedCount: number;
  readonly unaccountedForCount: number;
  readonly allAccountedFor: boolean;
}

export type RollCallScheduledEvent = DomainEvent<typeof ROLL_CALL_SCHEDULED, RollCallEventPayload>;
export type RollCallStartedEvent = DomainEvent<typeof ROLL_CALL_STARTED, RollCallEventPayload>;
export type RollCallCompletedEvent = DomainEvent<typeof ROLL_CALL_COMPLETED, RollCallEventPayload>;
export type RollCallCancelledEvent = DomainEvent<typeof ROLL_CALL_CANCELLED, RollCallEventPayload>;

const rollCallPayload = (rollCall: RollCall): RollCallEventPayload => {
  const summary = rollCallSummary(rollCall);
  return {
    rollCallId: rollCall.id,
    organizationId: rollCall.organizationId,
    hostelId: rollCall.hostelId,
    status: rollCall.status,
    expectedCount: summary.expectedCount,
    markedCount: summary.markedCount,
    unaccountedForCount: summary.unaccountedForCount,
    allAccountedFor: summary.allAccountedFor,
  };
};

export const rollCallScheduled = (rollCall: RollCall): RollCallScheduledEvent =>
  createEvent(ROLL_CALL_SCHEDULED, rollCallPayload(rollCall), { tenantId: rollCall.tenantId });

export const rollCallStarted = (rollCall: RollCall): RollCallStartedEvent =>
  createEvent(ROLL_CALL_STARTED, rollCallPayload(rollCall), { tenantId: rollCall.tenantId });

export const rollCallCompleted = (rollCall: RollCall): RollCallCompletedEvent =>
  createEvent(ROLL_CALL_COMPLETED, rollCallPayload(rollCall), { tenantId: rollCall.tenantId });

export const rollCallCancelled = (rollCall: RollCall): RollCallCancelledEvent =>
  createEvent(ROLL_CALL_CANCELLED, rollCallPayload(rollCall), { tenantId: rollCall.tenantId });

// --- Hostel inspection -----------------------------------------------------------
export const INSPECTION_RECORDED = "residential.inspection.recorded";
export const INSPECTION_REINSPECTED = "residential.inspection.reinspected";

export interface InspectionEventPayload {
  readonly inspectionId: Uuid;
  readonly organizationId: Uuid;
  readonly hostelId: Uuid;
  readonly type: string;
  readonly outcome: string;
  readonly nextDueOn: string;
}

export type InspectionRecordedEvent = DomainEvent<
  typeof INSPECTION_RECORDED,
  InspectionEventPayload
>;
export type InspectionReinspectedEvent = DomainEvent<
  typeof INSPECTION_REINSPECTED,
  InspectionEventPayload
>;

const inspectionPayload = (inspection: HostelInspection): InspectionEventPayload => ({
  inspectionId: inspection.id,
  organizationId: inspection.organizationId,
  hostelId: inspection.hostelId,
  type: inspection.type,
  outcome: inspection.outcome,
  nextDueOn: inspection.nextDueOn,
});

export const inspectionRecorded = (inspection: HostelInspection): InspectionRecordedEvent =>
  createEvent(INSPECTION_RECORDED, inspectionPayload(inspection), {
    tenantId: inspection.tenantId,
  });

export const inspectionReinspected = (inspection: HostelInspection): InspectionReinspectedEvent =>
  createEvent(INSPECTION_REINSPECTED, inspectionPayload(inspection), {
    tenantId: inspection.tenantId,
  });

// --- Hostel occupancy profile ----------------------------------------------------
export const OCCUPANCY_REFRESHED = "residential.occupancy.refreshed";

export interface OccupancyProfileEventPayload {
  readonly profileId: Uuid;
  readonly organizationId: Uuid;
  readonly hostelId: Uuid;
  readonly bedCount: number;
  readonly occupantCount: number;
  readonly overCapacity: boolean;
  readonly version: number;
}

export type OccupancyRefreshedEvent = DomainEvent<
  typeof OCCUPANCY_REFRESHED,
  OccupancyProfileEventPayload
>;

export const occupancyRefreshed = (profile: HostelOccupancyProfile): OccupancyRefreshedEvent =>
  createEvent(
    OCCUPANCY_REFRESHED,
    {
      profileId: profile.id,
      organizationId: profile.organizationId,
      hostelId: profile.hostelId,
      bedCount: profile.bedCount,
      occupantCount: profile.occupantCount,
      overCapacity: profile.overCapacity,
      version: profile.version,
    },
    { tenantId: profile.tenantId },
  );
