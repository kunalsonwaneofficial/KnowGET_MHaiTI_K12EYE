import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { Driver } from "./driver";
import type { Route } from "./route";
import type { TransportSubscription } from "./transport-subscription";
import type { Trip } from "./trip";
import type { Vehicle } from "./vehicle";
import type { VehicleAssignment } from "./vehicle-assignment";

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

// --- Route -----------------------------------------------------------------------
export const ROUTE_ACTIVATED = "transport.route.activated";
export const ROUTE_SUSPENDED = "transport.route.suspended";
export const ROUTE_RESUMED = "transport.route.resumed";
export const ROUTE_RETIRED = "transport.route.retired";

export interface RouteEventPayload {
  readonly routeId: Uuid;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly status: string;
}

export type RouteActivatedEvent = DomainEvent<typeof ROUTE_ACTIVATED, RouteEventPayload>;
export type RouteSuspendedEvent = DomainEvent<typeof ROUTE_SUSPENDED, RouteEventPayload>;
export type RouteResumedEvent = DomainEvent<typeof ROUTE_RESUMED, RouteEventPayload>;
export type RouteRetiredEvent = DomainEvent<typeof ROUTE_RETIRED, RouteEventPayload>;

const routePayload = (route: Route): RouteEventPayload => ({
  routeId: route.id,
  organizationId: route.organizationId,
  code: route.code,
  status: route.status,
});

export const routeActivated = (route: Route): RouteActivatedEvent =>
  createEvent(ROUTE_ACTIVATED, routePayload(route), { tenantId: route.tenantId });

export const routeSuspended = (route: Route): RouteSuspendedEvent =>
  createEvent(ROUTE_SUSPENDED, routePayload(route), { tenantId: route.tenantId });

export const routeResumed = (route: Route): RouteResumedEvent =>
  createEvent(ROUTE_RESUMED, routePayload(route), { tenantId: route.tenantId });

export const routeRetired = (route: Route): RouteRetiredEvent =>
  createEvent(ROUTE_RETIRED, routePayload(route), { tenantId: route.tenantId });

// --- Vehicle assignment ----------------------------------------------------------
export const ASSIGNMENT_CREATED = "transport.assignment.created";
export const ASSIGNMENT_ENDED = "transport.assignment.ended";

export interface AssignmentEventPayload {
  readonly assignmentId: Uuid;
  readonly organizationId: Uuid;
  readonly routeId: Uuid;
  readonly vehicleId: Uuid;
  readonly driverId: Uuid;
  readonly status: string;
}

export type AssignmentCreatedEvent = DomainEvent<typeof ASSIGNMENT_CREATED, AssignmentEventPayload>;
export type AssignmentEndedEvent = DomainEvent<typeof ASSIGNMENT_ENDED, AssignmentEventPayload>;

const assignmentPayload = (assignment: VehicleAssignment): AssignmentEventPayload => ({
  assignmentId: assignment.id,
  organizationId: assignment.organizationId,
  routeId: assignment.routeId,
  vehicleId: assignment.vehicleId,
  driverId: assignment.driverId,
  status: assignment.status,
});

export const assignmentCreated = (assignment: VehicleAssignment): AssignmentCreatedEvent =>
  createEvent(ASSIGNMENT_CREATED, assignmentPayload(assignment), {
    tenantId: assignment.tenantId,
  });

export const assignmentEnded = (assignment: VehicleAssignment): AssignmentEndedEvent =>
  createEvent(ASSIGNMENT_ENDED, assignmentPayload(assignment), { tenantId: assignment.tenantId });

// --- Transport subscription ------------------------------------------------------
export const SUBSCRIPTION_REQUESTED = "transport.subscription.requested";
export const SUBSCRIPTION_ACTIVATED = "transport.subscription.activated";
export const SUBSCRIPTION_SUSPENDED = "transport.subscription.suspended";
export const SUBSCRIPTION_RESUMED = "transport.subscription.resumed";
export const SUBSCRIPTION_ENDED = "transport.subscription.ended";

export interface SubscriptionEventPayload {
  readonly subscriptionId: Uuid;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly routeId: Uuid;
  readonly status: string;
}

export type SubscriptionRequestedEvent = DomainEvent<
  typeof SUBSCRIPTION_REQUESTED,
  SubscriptionEventPayload
>;
export type SubscriptionActivatedEvent = DomainEvent<
  typeof SUBSCRIPTION_ACTIVATED,
  SubscriptionEventPayload
>;
export type SubscriptionSuspendedEvent = DomainEvent<
  typeof SUBSCRIPTION_SUSPENDED,
  SubscriptionEventPayload
>;
export type SubscriptionResumedEvent = DomainEvent<
  typeof SUBSCRIPTION_RESUMED,
  SubscriptionEventPayload
>;
export type SubscriptionEndedEvent = DomainEvent<
  typeof SUBSCRIPTION_ENDED,
  SubscriptionEventPayload
>;

const subscriptionPayload = (subscription: TransportSubscription): SubscriptionEventPayload => ({
  subscriptionId: subscription.id,
  organizationId: subscription.organizationId,
  studentId: subscription.studentId,
  routeId: subscription.routeId,
  status: subscription.status,
});

export const subscriptionRequested = (
  subscription: TransportSubscription,
): SubscriptionRequestedEvent =>
  createEvent(SUBSCRIPTION_REQUESTED, subscriptionPayload(subscription), {
    tenantId: subscription.tenantId,
  });

export const subscriptionActivated = (
  subscription: TransportSubscription,
): SubscriptionActivatedEvent =>
  createEvent(SUBSCRIPTION_ACTIVATED, subscriptionPayload(subscription), {
    tenantId: subscription.tenantId,
  });

export const subscriptionSuspended = (
  subscription: TransportSubscription,
): SubscriptionSuspendedEvent =>
  createEvent(SUBSCRIPTION_SUSPENDED, subscriptionPayload(subscription), {
    tenantId: subscription.tenantId,
  });

export const subscriptionResumed = (
  subscription: TransportSubscription,
): SubscriptionResumedEvent =>
  createEvent(SUBSCRIPTION_RESUMED, subscriptionPayload(subscription), {
    tenantId: subscription.tenantId,
  });

export const subscriptionEnded = (subscription: TransportSubscription): SubscriptionEndedEvent =>
  createEvent(SUBSCRIPTION_ENDED, subscriptionPayload(subscription), {
    tenantId: subscription.tenantId,
  });

// --- Trip ------------------------------------------------------------------------
export const TRIP_SCHEDULED = "transport.trip.scheduled";
export const TRIP_STARTED = "transport.trip.started";
export const TRIP_COMPLETED = "transport.trip.completed";
export const TRIP_CANCELLED = "transport.trip.cancelled";

export interface TripEventPayload {
  readonly tripId: Uuid;
  readonly organizationId: Uuid;
  readonly routeId: Uuid;
  readonly serviceDate: string;
  readonly status: string;
}

export type TripScheduledEvent = DomainEvent<typeof TRIP_SCHEDULED, TripEventPayload>;
export type TripStartedEvent = DomainEvent<typeof TRIP_STARTED, TripEventPayload>;
export type TripCompletedEvent = DomainEvent<typeof TRIP_COMPLETED, TripEventPayload>;
export type TripCancelledEvent = DomainEvent<typeof TRIP_CANCELLED, TripEventPayload>;

const tripPayload = (trip: Trip): TripEventPayload => ({
  tripId: trip.id,
  organizationId: trip.organizationId,
  routeId: trip.routeId,
  serviceDate: trip.serviceDate,
  status: trip.status,
});

export const tripScheduled = (trip: Trip): TripScheduledEvent =>
  createEvent(TRIP_SCHEDULED, tripPayload(trip), { tenantId: trip.tenantId });

export const tripStarted = (trip: Trip): TripStartedEvent =>
  createEvent(TRIP_STARTED, tripPayload(trip), { tenantId: trip.tenantId });

export const tripCompleted = (trip: Trip): TripCompletedEvent =>
  createEvent(TRIP_COMPLETED, tripPayload(trip), { tenantId: trip.tenantId });

export const tripCancelled = (trip: Trip): TripCancelledEvent =>
  createEvent(TRIP_CANCELLED, tripPayload(trip), { tenantId: trip.tenantId });
