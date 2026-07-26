import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { Building } from "./building";
import type { Space } from "./space";

/**
 * Domain events for the Campus Infrastructure, Facilities & Smart Environment Platform (P2-D20), on the
 * `facilities.*` namespace. Payloads carry ids, non-sensitive metadata (a code, a type, a status) and
 * counts — never money (asset value, maintenance cost and utility billing live in Procurement & Assets
 * P2-D15 and Finance P2-D14).
 */

// --- Building --------------------------------------------------------------------
export const BUILDING_REGISTERED = "facilities.building.registered";
export const BUILDING_RENAMED = "facilities.building.renamed";
export const BUILDING_FLOORS_SET = "facilities.building.floors_set";
export const BUILDING_RENOVATION_STARTED = "facilities.building.renovation_started";
export const BUILDING_RENOVATION_COMPLETED = "facilities.building.renovation_completed";
export const BUILDING_DECOMMISSIONED = "facilities.building.decommissioned";

export interface BuildingEventPayload {
  readonly buildingId: Uuid;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly type: string;
  readonly floors: number;
  readonly status: string;
}

export type BuildingRegisteredEvent = DomainEvent<typeof BUILDING_REGISTERED, BuildingEventPayload>;
export type BuildingRenamedEvent = DomainEvent<typeof BUILDING_RENAMED, BuildingEventPayload>;
export type BuildingFloorsSetEvent = DomainEvent<typeof BUILDING_FLOORS_SET, BuildingEventPayload>;
export type BuildingRenovationStartedEvent = DomainEvent<
  typeof BUILDING_RENOVATION_STARTED,
  BuildingEventPayload
>;
export type BuildingRenovationCompletedEvent = DomainEvent<
  typeof BUILDING_RENOVATION_COMPLETED,
  BuildingEventPayload
>;
export type BuildingDecommissionedEvent = DomainEvent<
  typeof BUILDING_DECOMMISSIONED,
  BuildingEventPayload
>;

const buildingPayload = (building: Building): BuildingEventPayload => ({
  buildingId: building.id,
  organizationId: building.organizationId,
  code: building.code,
  type: building.type,
  floors: building.floors,
  status: building.status,
});

export const buildingRegistered = (building: Building): BuildingRegisteredEvent =>
  createEvent(BUILDING_REGISTERED, buildingPayload(building), { tenantId: building.tenantId });
export const buildingRenamed = (building: Building): BuildingRenamedEvent =>
  createEvent(BUILDING_RENAMED, buildingPayload(building), { tenantId: building.tenantId });
export const buildingFloorsSet = (building: Building): BuildingFloorsSetEvent =>
  createEvent(BUILDING_FLOORS_SET, buildingPayload(building), { tenantId: building.tenantId });
export const buildingRenovationStarted = (building: Building): BuildingRenovationStartedEvent =>
  createEvent(BUILDING_RENOVATION_STARTED, buildingPayload(building), {
    tenantId: building.tenantId,
  });
export const buildingRenovationCompleted = (building: Building): BuildingRenovationCompletedEvent =>
  createEvent(BUILDING_RENOVATION_COMPLETED, buildingPayload(building), {
    tenantId: building.tenantId,
  });
export const buildingDecommissioned = (building: Building): BuildingDecommissionedEvent =>
  createEvent(BUILDING_DECOMMISSIONED, buildingPayload(building), { tenantId: building.tenantId });

// --- Space -----------------------------------------------------------------------
export const SPACE_CREATED = "facilities.space.created";
export const SPACE_RECONFIGURED = "facilities.space.reconfigured";
export const SPACE_MADE_AVAILABLE = "facilities.space.made_available";
export const SPACE_TAKEN_OUT_OF_SERVICE = "facilities.space.taken_out_of_service";
export const SPACE_RETURNED_TO_SERVICE = "facilities.space.returned_to_service";
export const SPACE_DECOMMISSIONED = "facilities.space.decommissioned";

export interface SpaceEventPayload {
  readonly spaceId: Uuid;
  readonly buildingId: Uuid;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly type: string;
  readonly capacity: number;
  readonly status: string;
}

export type SpaceCreatedEvent = DomainEvent<typeof SPACE_CREATED, SpaceEventPayload>;
export type SpaceReconfiguredEvent = DomainEvent<typeof SPACE_RECONFIGURED, SpaceEventPayload>;
export type SpaceMadeAvailableEvent = DomainEvent<typeof SPACE_MADE_AVAILABLE, SpaceEventPayload>;
export type SpaceTakenOutOfServiceEvent = DomainEvent<
  typeof SPACE_TAKEN_OUT_OF_SERVICE,
  SpaceEventPayload
>;
export type SpaceReturnedToServiceEvent = DomainEvent<
  typeof SPACE_RETURNED_TO_SERVICE,
  SpaceEventPayload
>;
export type SpaceDecommissionedEvent = DomainEvent<typeof SPACE_DECOMMISSIONED, SpaceEventPayload>;

const spacePayload = (space: Space): SpaceEventPayload => ({
  spaceId: space.id,
  buildingId: space.buildingId,
  organizationId: space.organizationId,
  code: space.code,
  type: space.type,
  capacity: space.capacity,
  status: space.status,
});

export const spaceCreated = (space: Space): SpaceCreatedEvent =>
  createEvent(SPACE_CREATED, spacePayload(space), { tenantId: space.tenantId });
export const spaceReconfigured = (space: Space): SpaceReconfiguredEvent =>
  createEvent(SPACE_RECONFIGURED, spacePayload(space), { tenantId: space.tenantId });
export const spaceMadeAvailable = (space: Space): SpaceMadeAvailableEvent =>
  createEvent(SPACE_MADE_AVAILABLE, spacePayload(space), { tenantId: space.tenantId });
export const spaceTakenOutOfService = (space: Space): SpaceTakenOutOfServiceEvent =>
  createEvent(SPACE_TAKEN_OUT_OF_SERVICE, spacePayload(space), { tenantId: space.tenantId });
export const spaceReturnedToService = (space: Space): SpaceReturnedToServiceEvent =>
  createEvent(SPACE_RETURNED_TO_SERVICE, spacePayload(space), { tenantId: space.tenantId });
export const spaceDecommissioned = (space: Space): SpaceDecommissionedEvent =>
  createEvent(SPACE_DECOMMISSIONED, spacePayload(space), { tenantId: space.tenantId });
