import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { isDriverActive, isLicenseValidAsOf } from "./driver";
import {
  AssignmentNotFoundError,
  DriverLicenseExpiredError,
  DriverNotActiveError,
  DriverNotFoundError,
  RouteHasActiveAssignmentError,
  RouteNotActiveError,
  RouteNotFoundError,
  VehicleNotActiveError,
  VehicleNotFoundError,
} from "./errors";
import type {
  DriverRepository,
  RouteRepository,
  VehicleAssignmentRepository,
  VehicleRepository,
} from "./ports";
import { isRouteActive } from "./route";
import { assignmentCreated, assignmentEnded } from "./transport-events";
import {
  type CreateAssignmentParams,
  createVehicleAssignment,
  endAssignment,
  type VehicleAssignment,
} from "./vehicle-assignment";
import { isVehicleActive } from "./vehicle";

/** The service create input — the organization is derived from the route, not supplied. */
export type CreateAssignmentInput = Omit<CreateAssignmentParams, "organizationId">;

export interface VehicleAssignmentServiceDeps {
  readonly repository: VehicleAssignmentRepository;
  readonly routes: RouteRepository;
  readonly vehicles: VehicleRepository;
  readonly drivers: DriverRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for vehicle assignments — binds an active vehicle and a licensed, active driver to
 * an active route. It validates the route, vehicle and driver all exist and are active (and the driver's
 * licence is valid on the effective date), and enforces **one active assignment per route** (the prior
 * must be ended first). The organization is derived from the route. Publishes the assignment events.
 */
export class VehicleAssignmentService {
  private readonly repository: VehicleAssignmentRepository;
  private readonly routes: RouteRepository;
  private readonly vehicles: VehicleRepository;
  private readonly drivers: DriverRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: VehicleAssignmentServiceDeps) {
    this.repository = deps.repository;
    this.routes = deps.routes;
    this.vehicles = deps.vehicles;
    this.drivers = deps.drivers;
    this.events = deps.events;
  }

  async create(input: CreateAssignmentInput): Promise<VehicleAssignment> {
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
    if (!isLicenseValidAsOf(driver, input.effectiveFrom)) {
      throw new DriverLicenseExpiredError(input.driverId, input.effectiveFrom);
    }
    if (await this.repository.findActiveByRoute(input.tenantId, input.routeId)) {
      throw new RouteHasActiveAssignmentError(input.routeId);
    }
    const assignment = createVehicleAssignment({ ...input, organizationId: route.organizationId });
    await this.repository.save(assignment);
    await this.emit(assignmentCreated(assignment));
    return assignment;
  }

  async end(tenantId: TenantId, id: Uuid, effectiveTo?: string | null): Promise<VehicleAssignment> {
    const updated = endAssignment(await this.require(tenantId, id), effectiveTo);
    await this.repository.save(updated);
    await this.emit(assignmentEnded(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<VehicleAssignment> {
    return this.require(tenantId, id);
  }

  async getActiveForRoute(tenantId: TenantId, routeId: Uuid): Promise<VehicleAssignment | null> {
    return this.repository.findActiveByRoute(tenantId, routeId);
  }

  async listForRoute(tenantId: TenantId, routeId: Uuid): Promise<VehicleAssignment[]> {
    return this.repository.listByRoute(tenantId, routeId);
  }

  async listForVehicle(tenantId: TenantId, vehicleId: Uuid): Promise<VehicleAssignment[]> {
    return this.repository.listByVehicle(tenantId, vehicleId);
  }

  async listForOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<VehicleAssignment[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<VehicleAssignment> {
    const assignment = await this.repository.findById(tenantId, id);
    if (!assignment) {
      throw new AssignmentNotFoundError(id);
    }
    return assignment;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
