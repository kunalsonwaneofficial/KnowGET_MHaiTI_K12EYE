import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateVehicleRegistrationError,
  OrganizationNotFoundForTransportError,
  VehicleNotFoundError,
} from "./errors";
import type { OrganizationDirectory, VehicleRepository } from "./ports";
import {
  vehicleRegistered,
  vehicleRetired,
  vehicleReturnedFromMaintenance,
  vehicleSentToMaintenance,
} from "./transport-events";
import {
  type RegisterVehicleParams,
  registerVehicle,
  retireVehicle,
  returnVehicleFromMaintenance,
  sendVehicleToMaintenance,
  setSeatingCapacity,
  setVehicleMakeModel,
  type Vehicle,
} from "./vehicle";

export interface VehicleServiceDeps {
  readonly repository: VehicleRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for fleet vehicles — the vehicle master. Registers a vehicle (validating the
 * organization and a unique registration), edits its capacity and details, and drives the
 * `active ↔ under_maintenance` / `→ retired` lifecycle, publishing the vehicle events.
 */
export class VehicleService {
  private readonly repository: VehicleRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: VehicleServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async create(input: RegisterVehicleParams): Promise<Vehicle> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForTransportError(input.organizationId);
    }
    if (await this.repository.findByRegistration(input.tenantId, input.registrationNumber.trim())) {
      throw new DuplicateVehicleRegistrationError(input.registrationNumber.trim());
    }
    const vehicle = registerVehicle(input);
    await this.repository.save(vehicle);
    await this.emit(vehicleRegistered(vehicle));
    return vehicle;
  }

  async setCapacity(tenantId: TenantId, id: Uuid, seatingCapacity: number): Promise<Vehicle> {
    return this.mutate(tenantId, id, (v) => setSeatingCapacity(v, seatingCapacity));
  }

  async setMakeModel(
    tenantId: TenantId,
    id: Uuid,
    make: string | null,
    model: string | null,
  ): Promise<Vehicle> {
    return this.mutate(tenantId, id, (v) => setVehicleMakeModel(v, make, model));
  }

  async sendToMaintenance(tenantId: TenantId, id: Uuid): Promise<Vehicle> {
    const updated = sendVehicleToMaintenance(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(vehicleSentToMaintenance(updated));
    return updated;
  }

  async returnFromMaintenance(tenantId: TenantId, id: Uuid): Promise<Vehicle> {
    const updated = returnVehicleFromMaintenance(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(vehicleReturnedFromMaintenance(updated));
    return updated;
  }

  async retire(tenantId: TenantId, id: Uuid): Promise<Vehicle> {
    const updated = retireVehicle(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(vehicleRetired(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Vehicle> {
    return this.require(tenantId, id);
  }

  async getByRegistration(tenantId: TenantId, registrationNumber: string): Promise<Vehicle> {
    const vehicle = await this.repository.findByRegistration(tenantId, registrationNumber);
    if (!vehicle) {
      throw new VehicleNotFoundError(registrationNumber);
    }
    return vehicle;
  }

  async list(tenantId: TenantId): Promise<Vehicle[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Vehicle[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (vehicle: Vehicle) => Vehicle,
  ): Promise<Vehicle> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Vehicle> {
    const vehicle = await this.repository.findById(tenantId, id);
    if (!vehicle) {
      throw new VehicleNotFoundError(id);
    }
    return vehicle;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
