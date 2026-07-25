import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { isDriverActive, isLicenseValidAsOf } from "./driver";
import {
  DriverLicenseExpiredError,
  DriverNotActiveError,
  DriverNotFoundError,
  RouteNotActiveError,
  RouteNotFoundError,
  TripNotFoundError,
  VehicleNotActiveError,
  VehicleNotFoundError,
} from "./errors";
import type { DriverRepository, RouteRepository, TripRepository, VehicleRepository } from "./ports";
import { isRouteActive } from "./route";
import { tripCancelled, tripCompleted, tripScheduled, tripStarted } from "./transport-events";
import {
  cancelTrip,
  completeTrip,
  recordTripBoarding,
  type ScheduleTripParams,
  scheduleTrip,
  startTrip,
  type Trip,
  tripOccupancy,
} from "./trip";
import type { TripEventInput } from "./trip-event";
import type { TripOccupancy } from "./transport-view";
import { isVehicleActive } from "./vehicle";

/** The service schedule input — the organization and capacity are derived, not supplied. */
export type ScheduleTripInput = Omit<ScheduleTripParams, "organizationId" | "capacity">;

export interface TripServiceDeps {
  readonly repository: TripRepository;
  readonly routes: RouteRepository;
  readonly vehicles: VehicleRepository;
  readonly drivers: DriverRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for trips. Schedules a trip against an active route, vehicle and licensed driver
 * (snapshotting the vehicle's seating capacity and deriving the organization from the route), starts and
 * completes it, records boarding/alighting while in progress (capacity enforced by the aggregate), and
 * cancels it. Publishes the trip lifecycle events.
 */
export class TripService {
  private readonly repository: TripRepository;
  private readonly routes: RouteRepository;
  private readonly vehicles: VehicleRepository;
  private readonly drivers: DriverRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: TripServiceDeps) {
    this.repository = deps.repository;
    this.routes = deps.routes;
    this.vehicles = deps.vehicles;
    this.drivers = deps.drivers;
    this.events = deps.events;
  }

  async schedule(input: ScheduleTripInput): Promise<Trip> {
    const route = await this.routes.findById(input.tenantId, input.routeId);
    if (!route) {
      throw new RouteNotFoundError(input.routeId);
    }
    if (!isRouteActive(route)) {
      throw new RouteNotActiveError(input.routeId);
    }
    const vehicle = await this.vehicles.findById(input.tenantId, input.vehicleId);
    if (!vehicle) {
      throw new VehicleNotFoundError(input.vehicleId);
    }
    if (!isVehicleActive(vehicle)) {
      throw new VehicleNotActiveError(input.vehicleId);
    }
    const driver = await this.drivers.findById(input.tenantId, input.driverId);
    if (!driver) {
      throw new DriverNotFoundError(input.driverId);
    }
    if (!isDriverActive(driver)) {
      throw new DriverNotActiveError(input.driverId);
    }
    if (!isLicenseValidAsOf(driver, input.serviceDate)) {
      throw new DriverLicenseExpiredError(input.driverId, input.serviceDate);
    }
    const trip = scheduleTrip({
      ...input,
      organizationId: route.organizationId,
      capacity: vehicle.seatingCapacity,
    });
    await this.repository.save(trip);
    await this.emit(tripScheduled(trip));
    return trip;
  }

  async start(tenantId: TenantId, id: Uuid): Promise<Trip> {
    const updated = startTrip(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(tripStarted(updated));
    return updated;
  }

  async recordBoarding(tenantId: TenantId, id: Uuid, event: TripEventInput): Promise<Trip> {
    const updated = recordTripBoarding(await this.require(tenantId, id), event);
    await this.repository.save(updated);
    return updated;
  }

  async complete(tenantId: TenantId, id: Uuid): Promise<Trip> {
    const updated = completeTrip(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(tripCompleted(updated));
    return updated;
  }

  async cancel(tenantId: TenantId, id: Uuid): Promise<Trip> {
    const updated = cancelTrip(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(tripCancelled(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Trip> {
    return this.require(tenantId, id);
  }

  async occupancyFor(tenantId: TenantId, id: Uuid): Promise<TripOccupancy> {
    return tripOccupancy(await this.require(tenantId, id));
  }

  async listForRoute(tenantId: TenantId, routeId: Uuid): Promise<Trip[]> {
    return this.repository.listByRoute(tenantId, routeId);
  }

  async listForVehicle(tenantId: TenantId, vehicleId: Uuid): Promise<Trip[]> {
    return this.repository.listByVehicle(tenantId, vehicleId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Trip[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Trip> {
    const trip = await this.repository.findById(tenantId, id);
    if (!trip) {
      throw new TripNotFoundError(id);
    }
    return trip;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
