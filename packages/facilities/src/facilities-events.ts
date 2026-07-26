import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { Building } from "./building";
import type { FacilitySystem } from "./facility-system";
import type { Sensor } from "./sensor";
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

// --- Facility system -------------------------------------------------------------
export const SYSTEM_COMMISSIONED = "facilities.system.commissioned";
export const SYSTEM_SERVICED = "facilities.system.serviced";
export const SYSTEM_INTERVAL_SET = "facilities.system.interval_set";
export const SYSTEM_SENT_TO_MAINTENANCE = "facilities.system.sent_to_maintenance";
export const SYSTEM_RETURNED_TO_SERVICE = "facilities.system.returned_to_service";
export const SYSTEM_DECOMMISSIONED = "facilities.system.decommissioned";

export interface SystemEventPayload {
  readonly systemId: Uuid;
  readonly buildingId: Uuid;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly type: string;
  readonly status: string;
}

export type SystemCommissionedEvent = DomainEvent<typeof SYSTEM_COMMISSIONED, SystemEventPayload>;
export type SystemServicedEvent = DomainEvent<typeof SYSTEM_SERVICED, SystemEventPayload>;
export type SystemIntervalSetEvent = DomainEvent<typeof SYSTEM_INTERVAL_SET, SystemEventPayload>;
export type SystemSentToMaintenanceEvent = DomainEvent<
  typeof SYSTEM_SENT_TO_MAINTENANCE,
  SystemEventPayload
>;
export type SystemReturnedToServiceEvent = DomainEvent<
  typeof SYSTEM_RETURNED_TO_SERVICE,
  SystemEventPayload
>;
export type SystemDecommissionedEvent = DomainEvent<
  typeof SYSTEM_DECOMMISSIONED,
  SystemEventPayload
>;

const systemPayload = (system: FacilitySystem): SystemEventPayload => ({
  systemId: system.id,
  buildingId: system.buildingId,
  organizationId: system.organizationId,
  code: system.code,
  type: system.type,
  status: system.status,
});

export const systemCommissioned = (system: FacilitySystem): SystemCommissionedEvent =>
  createEvent(SYSTEM_COMMISSIONED, systemPayload(system), { tenantId: system.tenantId });
export const systemServiced = (system: FacilitySystem): SystemServicedEvent =>
  createEvent(SYSTEM_SERVICED, systemPayload(system), { tenantId: system.tenantId });
export const systemIntervalSet = (system: FacilitySystem): SystemIntervalSetEvent =>
  createEvent(SYSTEM_INTERVAL_SET, systemPayload(system), { tenantId: system.tenantId });
export const systemSentToMaintenance = (system: FacilitySystem): SystemSentToMaintenanceEvent =>
  createEvent(SYSTEM_SENT_TO_MAINTENANCE, systemPayload(system), { tenantId: system.tenantId });
export const systemReturnedToService = (system: FacilitySystem): SystemReturnedToServiceEvent =>
  createEvent(SYSTEM_RETURNED_TO_SERVICE, systemPayload(system), { tenantId: system.tenantId });
export const systemDecommissioned = (system: FacilitySystem): SystemDecommissionedEvent =>
  createEvent(SYSTEM_DECOMMISSIONED, systemPayload(system), { tenantId: system.tenantId });

// --- Sensor ----------------------------------------------------------------------
export const SENSOR_INSTALLED = "facilities.sensor.installed";
export const SENSOR_UNIT_SET = "facilities.sensor.unit_set";
export const SENSOR_DEACTIVATED = "facilities.sensor.deactivated";
export const SENSOR_REACTIVATED = "facilities.sensor.reactivated";
export const SENSOR_RETIRED = "facilities.sensor.retired";

export interface SensorEventPayload {
  readonly sensorId: Uuid;
  readonly spaceId: Uuid;
  readonly buildingId: Uuid;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly metric: string;
  readonly status: string;
}

export type SensorInstalledEvent = DomainEvent<typeof SENSOR_INSTALLED, SensorEventPayload>;
export type SensorUnitSetEvent = DomainEvent<typeof SENSOR_UNIT_SET, SensorEventPayload>;
export type SensorDeactivatedEvent = DomainEvent<typeof SENSOR_DEACTIVATED, SensorEventPayload>;
export type SensorReactivatedEvent = DomainEvent<typeof SENSOR_REACTIVATED, SensorEventPayload>;
export type SensorRetiredEvent = DomainEvent<typeof SENSOR_RETIRED, SensorEventPayload>;

const sensorPayload = (sensor: Sensor): SensorEventPayload => ({
  sensorId: sensor.id,
  spaceId: sensor.spaceId,
  buildingId: sensor.buildingId,
  organizationId: sensor.organizationId,
  code: sensor.code,
  metric: sensor.metric,
  status: sensor.status,
});

export const sensorInstalled = (sensor: Sensor): SensorInstalledEvent =>
  createEvent(SENSOR_INSTALLED, sensorPayload(sensor), { tenantId: sensor.tenantId });
export const sensorUnitSet = (sensor: Sensor): SensorUnitSetEvent =>
  createEvent(SENSOR_UNIT_SET, sensorPayload(sensor), { tenantId: sensor.tenantId });
export const sensorDeactivated = (sensor: Sensor): SensorDeactivatedEvent =>
  createEvent(SENSOR_DEACTIVATED, sensorPayload(sensor), { tenantId: sensor.tenantId });
export const sensorReactivated = (sensor: Sensor): SensorReactivatedEvent =>
  createEvent(SENSOR_REACTIVATED, sensorPayload(sensor), { tenantId: sensor.tenantId });
export const sensorRetired = (sensor: Sensor): SensorRetiredEvent =>
  createEvent(SENSOR_RETIRED, sensorPayload(sensor), { tenantId: sensor.tenantId });
