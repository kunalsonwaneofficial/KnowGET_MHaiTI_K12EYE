import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { isBuildingActive } from "./building";
import { computeServiceStatus } from "./condition";
import {
  BuildingNotActiveError,
  BuildingNotFoundError,
  DuplicateSystemCodeError,
  FacilitySystemNotFoundError,
} from "./errors";
import {
  type CommissionSystemParams,
  commissionSystem,
  decommissionSystem,
  type FacilitySystem,
  recordSystemService,
  returnSystemToService,
  sendSystemToMaintenance,
  setServiceInterval,
} from "./facility-system";
import {
  systemCommissioned,
  systemDecommissioned,
  systemIntervalSet,
  systemReturnedToService,
  systemSentToMaintenance,
  systemServiced,
} from "./facilities-events";
import type { ServiceStatus } from "./facilities-view";
import type { BuildingRepository, FacilitySystemRepository } from "./ports";

/** The commission input — the organization is derived from the building, not supplied. */
export type CommissionSystemInput = Omit<CommissionSystemParams, "organizationId">;

export interface FacilitySystemServiceDeps {
  readonly repository: FacilitySystemRepository;
  readonly buildings: BuildingRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for facility systems — a building's fixed infrastructure (HVAC, electrical, plumbing,
 * elevators, fire-safety, network, water). Commissions a system in an active building (deriving the org from
 * the building, enforcing a code unique within the building), records service and edits the interval, drives
 * the `operational ↔ under_maintenance → decommissioned` lifecycle, and derives a system's service status
 * (ok / due_soon / overdue) via the pure engine. No money — capital value and costed maintenance are the
 * Asset register's (P2-D15).
 */
export class FacilitySystemService {
  private readonly repository: FacilitySystemRepository;
  private readonly buildings: BuildingRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: FacilitySystemServiceDeps) {
    this.repository = deps.repository;
    this.buildings = deps.buildings;
    this.events = deps.events;
  }

  async commission(input: CommissionSystemInput): Promise<FacilitySystem> {
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
      throw new DuplicateSystemCodeError(input.code.trim());
    }
    const system = commissionSystem({ ...input, organizationId: building.organizationId });
    await this.repository.save(system);
    await this.emit(systemCommissioned(system));
    return system;
  }

  async recordService(tenantId: TenantId, id: Uuid, servicedOn: string): Promise<FacilitySystem> {
    const updated = recordSystemService(await this.require(tenantId, id), servicedOn);
    await this.repository.save(updated);
    await this.emit(systemServiced(updated));
    return updated;
  }

  async setInterval(tenantId: TenantId, id: Uuid, days: number): Promise<FacilitySystem> {
    const updated = setServiceInterval(await this.require(tenantId, id), days);
    await this.repository.save(updated);
    await this.emit(systemIntervalSet(updated));
    return updated;
  }

  async sendToMaintenance(tenantId: TenantId, id: Uuid): Promise<FacilitySystem> {
    const updated = sendSystemToMaintenance(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(systemSentToMaintenance(updated));
    return updated;
  }

  async returnToService(tenantId: TenantId, id: Uuid): Promise<FacilitySystem> {
    const updated = returnSystemToService(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(systemReturnedToService(updated));
    return updated;
  }

  async decommission(tenantId: TenantId, id: Uuid): Promise<FacilitySystem> {
    const updated = decommissionSystem(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(systemDecommissioned(updated));
    return updated;
  }

  /**
   * The system's service status (next-due date and ok / due_soon / overdue band) as of a date, derived by
   * the pure engine from its last-serviced date and interval. A never-serviced system reports `ok` with no
   * due date.
   */
  async serviceStatus(
    tenantId: TenantId,
    id: Uuid,
    asOfDate: string,
    warningDays?: number,
  ): Promise<ServiceStatus> {
    const system = await this.require(tenantId, id);
    return warningDays === undefined
      ? computeServiceStatus(system.lastServicedOn, system.serviceIntervalDays, asOfDate)
      : computeServiceStatus(
          system.lastServicedOn,
          system.serviceIntervalDays,
          asOfDate,
          warningDays,
        );
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<FacilitySystem> {
    return this.require(tenantId, id);
  }

  async listForBuilding(tenantId: TenantId, buildingId: Uuid): Promise<FacilitySystem[]> {
    return this.repository.listByBuilding(tenantId, buildingId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<FacilitySystem[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<FacilitySystem> {
    const system = await this.repository.findById(tenantId, id);
    if (!system) {
      throw new FacilitySystemNotFoundError(id);
    }
    return system;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
