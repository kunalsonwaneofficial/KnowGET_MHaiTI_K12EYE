import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { computeBuildingCondition, summarizeCampusCondition } from "./condition";
import { BuildingNotFoundError } from "./errors";
import { facilityProfileRefreshed } from "./facilities-events";
import type { CampusConditionSummary } from "./facilities-view";
import {
  composeFacilityProfile,
  type FacilityProfile,
  refreshFacilityProfile,
} from "./facility-profile";
import { isMaintenanceOrderOpen } from "./maintenance-order";
import type {
  BuildingRepository,
  FacilityProfileRepository,
  FacilitySystemRepository,
  MaintenanceOrderRepository,
  SpaceRepository,
} from "./ports";

export interface FacilityProfileServiceDeps {
  readonly repository: FacilityProfileRepository;
  readonly buildings: BuildingRepository;
  readonly spaces: SpaceRepository;
  readonly systems: FacilitySystemRepository;
  readonly maintenanceOrders: MaintenanceOrderRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for facility profiles — the per-building read model. `refresh` recomputes a building's
 * profile from its spaces and systems (via the pure condition engine) and its count of open maintenance
 * orders, upserting one row per building and publishing the refresh event. `summarizeCampus` rolls the
 * organization's profiles into a campus-wide condition picture via the pure rollup engine.
 */
export class FacilityProfileService {
  private readonly repository: FacilityProfileRepository;
  private readonly buildings: BuildingRepository;
  private readonly spaces: SpaceRepository;
  private readonly systems: FacilitySystemRepository;
  private readonly maintenanceOrders: MaintenanceOrderRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: FacilityProfileServiceDeps) {
    this.repository = deps.repository;
    this.buildings = deps.buildings;
    this.spaces = deps.spaces;
    this.systems = deps.systems;
    this.maintenanceOrders = deps.maintenanceOrders;
    this.events = deps.events;
  }

  async refresh(
    tenantId: TenantId,
    buildingId: Uuid,
    refreshedAt: string,
  ): Promise<FacilityProfile> {
    const building = await this.buildings.findById(tenantId, buildingId);
    if (!building) {
      throw new BuildingNotFoundError(buildingId);
    }
    const spaces = await this.spaces.listByBuilding(tenantId, buildingId);
    const systems = await this.systems.listByBuilding(tenantId, buildingId);
    const orders = await this.maintenanceOrders.listByBuilding(tenantId, buildingId);
    const condition = computeBuildingCondition(spaces, systems);
    const openMaintenanceCount = orders.filter(isMaintenanceOrderOpen).length;
    const params = {
      tenantId,
      organizationId: building.organizationId,
      buildingId,
      buildingCode: building.code,
      buildingName: building.name,
      buildingStatus: building.status,
      condition,
      openMaintenanceCount,
      refreshedAt,
    };
    const existing = await this.repository.findByBuilding(tenantId, buildingId);
    const profile = existing
      ? refreshFacilityProfile(existing, params)
      : composeFacilityProfile(params);
    await this.repository.save(profile);
    await this.emit(facilityProfileRefreshed(profile));
    return profile;
  }

  async getForBuilding(tenantId: TenantId, buildingId: Uuid): Promise<FacilityProfile | null> {
    return this.repository.findByBuilding(tenantId, buildingId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<FacilityProfile[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  /** Roll the organization's building profiles into a campus-wide condition summary. */
  async summarizeCampus(tenantId: TenantId, organizationId: Uuid): Promise<CampusConditionSummary> {
    const profiles = await this.repository.listByOrganization(tenantId, organizationId);
    return summarizeCampusCondition(profiles);
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
