import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { isBuildingActive } from "./building";
import {
  BuildingNotActiveError,
  BuildingNotFoundError,
  DuplicateSpaceCodeError,
  SpaceNotFoundError,
} from "./errors";
import {
  spaceCreated,
  spaceDecommissioned,
  spaceMadeAvailable,
  spaceReconfigured,
  spaceReturnedToService,
  spaceTakenOutOfService,
} from "./facilities-events";
import type { SpaceType } from "./facilities-value";
import type { BuildingRepository, SpaceRepository } from "./ports";
import {
  type CreateSpaceParams,
  createSpace,
  decommissionSpace,
  makeSpaceAvailable,
  returnSpaceToService,
  setSpaceCapacity,
  setSpaceFloor,
  setSpaceType,
  type Space,
  takeSpaceOutOfService,
} from "./space";

/** The create input — the organization is derived from the building, not supplied. */
export type CreateSpaceInput = Omit<CreateSpaceParams, "organizationId">;

export interface SpaceServiceDeps {
  readonly repository: SpaceRepository;
  readonly buildings: BuildingRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for spaces. Creates a space in an active building (deriving the org from the building,
 * enforcing a code unique within the building), edits its type/capacity/floor, and drives the
 * `draft → available ↔ out_of_service → decommissioned` lifecycle, publishing the space events.
 */
export class SpaceService {
  private readonly repository: SpaceRepository;
  private readonly buildings: BuildingRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: SpaceServiceDeps) {
    this.repository = deps.repository;
    this.buildings = deps.buildings;
    this.events = deps.events;
  }

  async create(input: CreateSpaceInput): Promise<Space> {
    const building = await this.buildings.findById(input.tenantId, input.buildingId);
    if (!building) {
      throw new BuildingNotFoundError(input.buildingId);
    }
    if (!isBuildingActive(building)) {
      throw new BuildingNotActiveError(input.buildingId);
    }
    if (
      await this.repository.findByCodeInBuilding(
        input.tenantId,
        input.buildingId,
        input.code.trim(),
      )
    ) {
      throw new DuplicateSpaceCodeError(input.code.trim());
    }
    const space = createSpace({ ...input, organizationId: building.organizationId });
    await this.repository.save(space);
    await this.emit(spaceCreated(space));
    return space;
  }

  async setType(tenantId: TenantId, id: Uuid, type: SpaceType): Promise<Space> {
    return this.reconfigure(tenantId, id, (s) => setSpaceType(s, type));
  }

  async setCapacity(tenantId: TenantId, id: Uuid, capacity: number): Promise<Space> {
    return this.reconfigure(tenantId, id, (s) => setSpaceCapacity(s, capacity));
  }

  async setFloor(tenantId: TenantId, id: Uuid, floor: number): Promise<Space> {
    return this.reconfigure(tenantId, id, (s) => setSpaceFloor(s, floor));
  }

  async makeAvailable(tenantId: TenantId, id: Uuid): Promise<Space> {
    const updated = makeSpaceAvailable(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(spaceMadeAvailable(updated));
    return updated;
  }

  async takeOutOfService(tenantId: TenantId, id: Uuid): Promise<Space> {
    const updated = takeSpaceOutOfService(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(spaceTakenOutOfService(updated));
    return updated;
  }

  async returnToService(tenantId: TenantId, id: Uuid): Promise<Space> {
    const updated = returnSpaceToService(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(spaceReturnedToService(updated));
    return updated;
  }

  async decommission(tenantId: TenantId, id: Uuid): Promise<Space> {
    const updated = decommissionSpace(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(spaceDecommissioned(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Space> {
    return this.require(tenantId, id);
  }

  async listForBuilding(tenantId: TenantId, buildingId: Uuid): Promise<Space[]> {
    return this.repository.listByBuilding(tenantId, buildingId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Space[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async reconfigure(
    tenantId: TenantId,
    id: Uuid,
    fn: (space: Space) => Space,
  ): Promise<Space> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(spaceReconfigured(updated));
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Space> {
    const space = await this.repository.findById(tenantId, id);
    if (!space) {
      throw new SpaceNotFoundError(id);
    }
    return space;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
