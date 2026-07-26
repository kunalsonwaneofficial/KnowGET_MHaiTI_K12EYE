import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  type Building,
  completeBuildingRenovation,
  decommissionBuilding,
  type RegisterBuildingParams,
  registerBuilding,
  renameBuilding,
  setBuildingFloors,
  startBuildingRenovation,
} from "./building";
import {
  BuildingNotFoundError,
  DuplicateBuildingCodeError,
  OrganizationNotFoundForFacilitiesError,
} from "./errors";
import {
  buildingDecommissioned,
  buildingFloorsSet,
  buildingRegistered,
  buildingRenamed,
  buildingRenovationCompleted,
  buildingRenovationStarted,
} from "./facilities-events";
import type { BuildingRepository, OrganizationDirectory } from "./ports";

export interface BuildingServiceDeps {
  readonly repository: BuildingRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for buildings — the campus facility master. Registers a building (validating the
 * organization and a unique code), renames it, sets its floor count, and drives the
 * `active ↔ under_renovation` / `→ decommissioned` lifecycle, publishing the building events.
 */
export class BuildingService {
  private readonly repository: BuildingRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: BuildingServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async create(input: RegisterBuildingParams): Promise<Building> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForFacilitiesError(input.organizationId);
    }
    if (await this.repository.findByCode(input.tenantId, input.code.trim())) {
      throw new DuplicateBuildingCodeError(input.code.trim());
    }
    const building = registerBuilding(input);
    await this.repository.save(building);
    await this.emit(buildingRegistered(building));
    return building;
  }

  async rename(tenantId: TenantId, id: Uuid, name: string): Promise<Building> {
    const updated = renameBuilding(await this.require(tenantId, id), name);
    await this.repository.save(updated);
    await this.emit(buildingRenamed(updated));
    return updated;
  }

  async setFloors(tenantId: TenantId, id: Uuid, floors: number): Promise<Building> {
    const updated = setBuildingFloors(await this.require(tenantId, id), floors);
    await this.repository.save(updated);
    await this.emit(buildingFloorsSet(updated));
    return updated;
  }

  async startRenovation(tenantId: TenantId, id: Uuid): Promise<Building> {
    const updated = startBuildingRenovation(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(buildingRenovationStarted(updated));
    return updated;
  }

  async completeRenovation(tenantId: TenantId, id: Uuid): Promise<Building> {
    const updated = completeBuildingRenovation(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(buildingRenovationCompleted(updated));
    return updated;
  }

  async decommission(tenantId: TenantId, id: Uuid): Promise<Building> {
    const updated = decommissionBuilding(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(buildingDecommissioned(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Building> {
    return this.require(tenantId, id);
  }

  async getByCode(tenantId: TenantId, code: string): Promise<Building> {
    const building = await this.repository.findByCode(tenantId, code);
    if (!building) {
      throw new BuildingNotFoundError(code);
    }
    return building;
  }

  async list(tenantId: TenantId): Promise<Building[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Building[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Building> {
    const building = await this.repository.findById(tenantId, id);
    if (!building) {
      throw new BuildingNotFoundError(id);
    }
    return building;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
