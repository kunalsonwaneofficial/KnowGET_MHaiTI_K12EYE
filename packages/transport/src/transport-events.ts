import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { Driver } from "./driver";
import type { Vehicle } from "./vehicle";

// --- Vehicle ---------------------------------------------------------------------
export const VEHICLE_REGISTERED = "transport.vehicle.registered";
export const VEHICLE_SENT_TO_MAINTENANCE = "transport.vehicle.sent_to_maintenance";
export const VEHICLE_RETURNED_FROM_MAINTENANCE = "transport.vehicle.returned_from_maintenance";
export const VEHICLE_RETIRED = "transport.vehicle.retired";

export interface VehicleEventPayload {
  readonly vehicleId: Uuid;
  readonly organizationId: Uuid;
  readonly registrationNumber: string;
  readonly status: string;
}

export type VehicleRegisteredEvent = DomainEvent<typeof VEHICLE_REGISTERED, VehicleEventPayload>;
export type VehicleSentToMaintenanceEvent = DomainEvent<
  typeof VEHICLE_SENT_TO_MAINTENANCE,
  VehicleEventPayload
>;
export type VehicleReturnedFromMaintenanceEvent = DomainEvent<
  typeof VEHICLE_RETURNED_FROM_MAINTENANCE,
  VehicleEventPayload
>;
export type VehicleRetiredEvent = DomainEvent<typeof VEHICLE_RETIRED, VehicleEventPayload>;

const vehiclePayload = (vehicle: Vehicle): VehicleEventPayload => ({
  vehicleId: vehicle.id,
  organizationId: vehicle.organizationId,
  registrationNumber: vehicle.registrationNumber,
  status: vehicle.status,
});

export const vehicleRegistered = (vehicle: Vehicle): VehicleRegisteredEvent =>
  createEvent(VEHICLE_REGISTERED, vehiclePayload(vehicle), { tenantId: vehicle.tenantId });

export const vehicleSentToMaintenance = (vehicle: Vehicle): VehicleSentToMaintenanceEvent =>
  createEvent(VEHICLE_SENT_TO_MAINTENANCE, vehiclePayload(vehicle), { tenantId: vehicle.tenantId });

export const vehicleReturnedFromMaintenance = (
  vehicle: Vehicle,
): VehicleReturnedFromMaintenanceEvent =>
  createEvent(VEHICLE_RETURNED_FROM_MAINTENANCE, vehiclePayload(vehicle), {
    tenantId: vehicle.tenantId,
  });

export const vehicleRetired = (vehicle: Vehicle): VehicleRetiredEvent =>
  createEvent(VEHICLE_RETIRED, vehiclePayload(vehicle), { tenantId: vehicle.tenantId });

// --- Driver ----------------------------------------------------------------------
export const DRIVER_REGISTERED = "transport.driver.registered";
export const DRIVER_SUSPENDED = "transport.driver.suspended";
export const DRIVER_REINSTATED = "transport.driver.reinstated";
export const DRIVER_DEACTIVATED = "transport.driver.deactivated";

export interface DriverEventPayload {
  readonly driverId: Uuid;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
  readonly status: string;
}

export type DriverRegisteredEvent = DomainEvent<typeof DRIVER_REGISTERED, DriverEventPayload>;
export type DriverSuspendedEvent = DomainEvent<typeof DRIVER_SUSPENDED, DriverEventPayload>;
export type DriverReinstatedEvent = DomainEvent<typeof DRIVER_REINSTATED, DriverEventPayload>;
export type DriverDeactivatedEvent = DomainEvent<typeof DRIVER_DEACTIVATED, DriverEventPayload>;

const driverPayload = (driver: Driver): DriverEventPayload => ({
  driverId: driver.id,
  organizationId: driver.organizationId,
  employeeId: driver.employeeId,
  status: driver.status,
});

export const driverRegistered = (driver: Driver): DriverRegisteredEvent =>
  createEvent(DRIVER_REGISTERED, driverPayload(driver), { tenantId: driver.tenantId });

export const driverSuspended = (driver: Driver): DriverSuspendedEvent =>
  createEvent(DRIVER_SUSPENDED, driverPayload(driver), { tenantId: driver.tenantId });

export const driverReinstated = (driver: Driver): DriverReinstatedEvent =>
  createEvent(DRIVER_REINSTATED, driverPayload(driver), { tenantId: driver.tenantId });

export const driverDeactivated = (driver: Driver): DriverDeactivatedEvent =>
  createEvent(DRIVER_DEACTIVATED, driverPayload(driver), { tenantId: driver.tenantId });
