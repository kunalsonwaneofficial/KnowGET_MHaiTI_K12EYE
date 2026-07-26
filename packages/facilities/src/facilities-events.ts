import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { Building } from "./building";
import type { ComfortPolicy } from "./comfort-policy";
import type { EnvironmentReading } from "./environment-reading";
import type { FacilityProfile } from "./facility-profile";
import type { FacilitySystem } from "./facility-system";
import type { MaintenanceOrder } from "./maintenance-order";
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

// --- Environment reading ---------------------------------------------------------
export const READING_RECORDED = "facilities.reading.recorded";

export interface ReadingEventPayload {
  readonly readingId: Uuid;
  readonly sensorId: Uuid;
  readonly spaceId: Uuid;
  readonly buildingId: Uuid;
  readonly organizationId: Uuid;
  readonly metric: string;
  readonly value: number;
  readonly recordedAt: string;
}

export type ReadingRecordedEvent = DomainEvent<typeof READING_RECORDED, ReadingEventPayload>;

const readingPayload = (reading: EnvironmentReading): ReadingEventPayload => ({
  readingId: reading.id,
  sensorId: reading.sensorId,
  spaceId: reading.spaceId,
  buildingId: reading.buildingId,
  organizationId: reading.organizationId,
  metric: reading.metric,
  value: reading.value,
  recordedAt: reading.recordedAt,
});

export const readingRecorded = (reading: EnvironmentReading): ReadingRecordedEvent =>
  createEvent(READING_RECORDED, readingPayload(reading), { tenantId: reading.tenantId });

// --- Maintenance order -----------------------------------------------------------
export const MAINTENANCE_REPORTED = "facilities.maintenance.reported";
export const MAINTENANCE_ASSIGNED = "facilities.maintenance.assigned";
export const MAINTENANCE_REASSIGNED = "facilities.maintenance.reassigned";
export const MAINTENANCE_REPRIORITIZED = "facilities.maintenance.reprioritized";
export const MAINTENANCE_STARTED = "facilities.maintenance.started";
export const MAINTENANCE_COMPLETED = "facilities.maintenance.completed";
export const MAINTENANCE_CANCELLED = "facilities.maintenance.cancelled";

export interface MaintenanceEventPayload {
  readonly orderId: Uuid;
  readonly buildingId: Uuid;
  readonly organizationId: Uuid;
  readonly spaceId: Uuid | null;
  readonly systemId: Uuid | null;
  readonly code: string;
  readonly category: string;
  readonly priority: string;
  readonly status: string;
  readonly assigneeId: Uuid | null;
}

export type MaintenanceReportedEvent = DomainEvent<
  typeof MAINTENANCE_REPORTED,
  MaintenanceEventPayload
>;
export type MaintenanceAssignedEvent = DomainEvent<
  typeof MAINTENANCE_ASSIGNED,
  MaintenanceEventPayload
>;
export type MaintenanceReassignedEvent = DomainEvent<
  typeof MAINTENANCE_REASSIGNED,
  MaintenanceEventPayload
>;
export type MaintenanceReprioritizedEvent = DomainEvent<
  typeof MAINTENANCE_REPRIORITIZED,
  MaintenanceEventPayload
>;
export type MaintenanceStartedEvent = DomainEvent<
  typeof MAINTENANCE_STARTED,
  MaintenanceEventPayload
>;
export type MaintenanceCompletedEvent = DomainEvent<
  typeof MAINTENANCE_COMPLETED,
  MaintenanceEventPayload
>;
export type MaintenanceCancelledEvent = DomainEvent<
  typeof MAINTENANCE_CANCELLED,
  MaintenanceEventPayload
>;

const maintenancePayload = (order: MaintenanceOrder): MaintenanceEventPayload => ({
  orderId: order.id,
  buildingId: order.buildingId,
  organizationId: order.organizationId,
  spaceId: order.spaceId,
  systemId: order.systemId,
  code: order.code,
  category: order.category,
  priority: order.priority,
  status: order.status,
  assigneeId: order.assigneeId,
});

export const maintenanceReported = (order: MaintenanceOrder): MaintenanceReportedEvent =>
  createEvent(MAINTENANCE_REPORTED, maintenancePayload(order), { tenantId: order.tenantId });
export const maintenanceAssigned = (order: MaintenanceOrder): MaintenanceAssignedEvent =>
  createEvent(MAINTENANCE_ASSIGNED, maintenancePayload(order), { tenantId: order.tenantId });
export const maintenanceReassigned = (order: MaintenanceOrder): MaintenanceReassignedEvent =>
  createEvent(MAINTENANCE_REASSIGNED, maintenancePayload(order), { tenantId: order.tenantId });
export const maintenanceReprioritized = (order: MaintenanceOrder): MaintenanceReprioritizedEvent =>
  createEvent(MAINTENANCE_REPRIORITIZED, maintenancePayload(order), { tenantId: order.tenantId });
export const maintenanceStarted = (order: MaintenanceOrder): MaintenanceStartedEvent =>
  createEvent(MAINTENANCE_STARTED, maintenancePayload(order), { tenantId: order.tenantId });
export const maintenanceCompleted = (order: MaintenanceOrder): MaintenanceCompletedEvent =>
  createEvent(MAINTENANCE_COMPLETED, maintenancePayload(order), { tenantId: order.tenantId });
export const maintenanceCancelled = (order: MaintenanceOrder): MaintenanceCancelledEvent =>
  createEvent(MAINTENANCE_CANCELLED, maintenancePayload(order), { tenantId: order.tenantId });

// --- Comfort policy --------------------------------------------------------------
export const COMFORT_POLICY_DRAFTED = "facilities.comfort_policy.drafted";
export const COMFORT_POLICY_UPDATED = "facilities.comfort_policy.updated";
export const COMFORT_POLICY_ACTIVATED = "facilities.comfort_policy.activated";
export const COMFORT_POLICY_ARCHIVED = "facilities.comfort_policy.archived";

export interface ComfortPolicyEventPayload {
  readonly policyId: Uuid;
  readonly organizationId: Uuid;
  readonly name: string;
  readonly version: number;
  readonly status: string;
  readonly metricCount: number;
}

export type ComfortPolicyDraftedEvent = DomainEvent<
  typeof COMFORT_POLICY_DRAFTED,
  ComfortPolicyEventPayload
>;
export type ComfortPolicyUpdatedEvent = DomainEvent<
  typeof COMFORT_POLICY_UPDATED,
  ComfortPolicyEventPayload
>;
export type ComfortPolicyActivatedEvent = DomainEvent<
  typeof COMFORT_POLICY_ACTIVATED,
  ComfortPolicyEventPayload
>;
export type ComfortPolicyArchivedEvent = DomainEvent<
  typeof COMFORT_POLICY_ARCHIVED,
  ComfortPolicyEventPayload
>;

const comfortPolicyPayload = (policy: ComfortPolicy): ComfortPolicyEventPayload => ({
  policyId: policy.id,
  organizationId: policy.organizationId,
  name: policy.name,
  version: policy.version,
  status: policy.status,
  metricCount: policy.thresholds.length,
});

export const comfortPolicyDrafted = (policy: ComfortPolicy): ComfortPolicyDraftedEvent =>
  createEvent(COMFORT_POLICY_DRAFTED, comfortPolicyPayload(policy), { tenantId: policy.tenantId });
export const comfortPolicyUpdated = (policy: ComfortPolicy): ComfortPolicyUpdatedEvent =>
  createEvent(COMFORT_POLICY_UPDATED, comfortPolicyPayload(policy), { tenantId: policy.tenantId });
export const comfortPolicyActivated = (policy: ComfortPolicy): ComfortPolicyActivatedEvent =>
  createEvent(COMFORT_POLICY_ACTIVATED, comfortPolicyPayload(policy), {
    tenantId: policy.tenantId,
  });
export const comfortPolicyArchived = (policy: ComfortPolicy): ComfortPolicyArchivedEvent =>
  createEvent(COMFORT_POLICY_ARCHIVED, comfortPolicyPayload(policy), { tenantId: policy.tenantId });

// --- Facility profile ------------------------------------------------------------
export const FACILITY_PROFILE_REFRESHED = "facilities.profile.refreshed";

export interface FacilityProfileEventPayload {
  readonly profileId: Uuid;
  readonly buildingId: Uuid;
  readonly organizationId: Uuid;
  readonly readinessPercent: number;
  readonly openMaintenanceCount: number;
  readonly refreshedAt: string;
}

export type FacilityProfileRefreshedEvent = DomainEvent<
  typeof FACILITY_PROFILE_REFRESHED,
  FacilityProfileEventPayload
>;

const facilityProfilePayload = (profile: FacilityProfile): FacilityProfileEventPayload => ({
  profileId: profile.id,
  buildingId: profile.buildingId,
  organizationId: profile.organizationId,
  readinessPercent: profile.readinessPercent,
  openMaintenanceCount: profile.openMaintenanceCount,
  refreshedAt: profile.refreshedAt,
});

export const facilityProfileRefreshed = (profile: FacilityProfile): FacilityProfileRefreshedEvent =>
  createEvent(FACILITY_PROFILE_REFRESHED, facilityProfilePayload(profile), {
    tenantId: profile.tenantId,
  });
