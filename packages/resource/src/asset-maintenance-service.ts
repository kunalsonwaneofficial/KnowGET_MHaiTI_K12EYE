import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  type AssetMaintenance,
  cancelMaintenance,
  completeMaintenance,
  type CompleteMaintenanceParams,
  scheduleMaintenance,
  type ScheduleMaintenanceParams,
  setMaintenanceSchedule,
} from "./asset-maintenance";
import { AssetMaintenanceNotFoundError, AssetNotFoundError } from "./errors";
import type { AssetMaintenanceRepository, AssetRepository } from "./ports";
import { maintenanceCompleted, maintenanceScheduled } from "./resource-events";

/** The service schedule input — the organization is derived from the asset, not supplied. */
export type ScheduleMaintenanceInput = Omit<ScheduleMaintenanceParams, "organizationId">;

export interface AssetMaintenanceServiceDeps {
  readonly repository: AssetMaintenanceRepository;
  readonly assets: AssetRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for asset-maintenance records. Schedules maintenance against an asset (deriving
 * the organization from it), and drives the `scheduled → completed | cancelled` lifecycle, recording
 * the performed date and actual cost on completion. Publishes the schedule/complete events.
 */
export class AssetMaintenanceService {
  private readonly repository: AssetMaintenanceRepository;
  private readonly assets: AssetRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AssetMaintenanceServiceDeps) {
    this.repository = deps.repository;
    this.assets = deps.assets;
    this.events = deps.events;
  }

  async schedule(input: ScheduleMaintenanceInput): Promise<AssetMaintenance> {
    const asset = await this.assets.findById(input.tenantId, input.assetId);
    if (!asset) {
      throw new AssetNotFoundError(input.assetId);
    }
    const maintenance = scheduleMaintenance({
      ...input,
      organizationId: asset.organizationId,
    });
    await this.repository.save(maintenance);
    await this.emit(maintenanceScheduled(maintenance));
    return maintenance;
  }

  async setSchedule(
    tenantId: TenantId,
    id: Uuid,
    scheduledDate: string | null,
  ): Promise<AssetMaintenance> {
    return this.mutate(tenantId, id, (m) => setMaintenanceSchedule(m, scheduledDate));
  }

  async complete(
    tenantId: TenantId,
    id: Uuid,
    params: CompleteMaintenanceParams,
  ): Promise<AssetMaintenance> {
    const updated = completeMaintenance(await this.require(tenantId, id), params);
    await this.repository.save(updated);
    await this.emit(maintenanceCompleted(updated));
    return updated;
  }

  async cancel(tenantId: TenantId, id: Uuid, notes?: string | null): Promise<AssetMaintenance> {
    return this.mutate(tenantId, id, (m) => cancelMaintenance(m, notes));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<AssetMaintenance> {
    return this.require(tenantId, id);
  }

  async listForAsset(tenantId: TenantId, assetId: Uuid): Promise<AssetMaintenance[]> {
    return this.repository.listByAsset(tenantId, assetId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (maintenance: AssetMaintenance) => AssetMaintenance,
  ): Promise<AssetMaintenance> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<AssetMaintenance> {
    const maintenance = await this.repository.findById(tenantId, id);
    if (!maintenance) {
      throw new AssetMaintenanceNotFoundError(id);
    }
    return maintenance;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
