import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  assetDepreciationAsOf,
  assignCustodian,
  disposeAsset,
  registerAsset,
  type RegisterAssetParams,
  renameAsset,
  returnAssetFromMaintenance,
  retireAsset,
  type Asset,
  sendAssetToMaintenance,
  setAssetCategory,
  setAssetLocation,
} from "./asset";
import {
  AssetNotFoundError,
  DuplicateAssetTagError,
  EmployeeNotFoundForResourceError,
  OrganizationNotFoundForResourceError,
} from "./errors";
import type { AssetRepository, EmployeeDirectory, OrganizationDirectory } from "./ports";
import { assetDisposed, assetRegistered, assetRetired } from "./resource-events";
import type { DepreciationResult } from "./resource-view";

export interface AssetServiceDeps {
  readonly repository: AssetRepository;
  readonly organizations: OrganizationDirectory;
  readonly employees: EmployeeDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for fixed assets. Registers an asset (validating the organization, a unique tag
 * and — if set — the custodian employee), edits its details and custodian, drives the
 * `in_service ↔ under_maintenance` / `→ retired → disposed` lifecycle, and computes depreciation
 * (net book value) as of a date through the pure engine. Publishes the register/retire/dispose events.
 */
export class AssetService {
  private readonly repository: AssetRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly employees: EmployeeDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AssetServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.employees = deps.employees;
    this.events = deps.events;
  }

  async register(input: RegisterAssetParams): Promise<Asset> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForResourceError(input.organizationId);
    }
    if (await this.repository.findByTag(input.tenantId, input.assetTag.trim())) {
      throw new DuplicateAssetTagError(input.assetTag.trim());
    }
    const custodianId = input.custodianId ?? null;
    if (custodianId !== null && !(await this.employees.exists(input.tenantId, custodianId))) {
      throw new EmployeeNotFoundForResourceError(custodianId);
    }
    const asset = registerAsset(input);
    await this.repository.save(asset);
    await this.emit(assetRegistered(asset));
    return asset;
  }

  async rename(tenantId: TenantId, id: Uuid, name: string): Promise<Asset> {
    return this.mutate(tenantId, id, (a) => renameAsset(a, name));
  }

  async setCategory(tenantId: TenantId, id: Uuid, category: string | null): Promise<Asset> {
    return this.mutate(tenantId, id, (a) => setAssetCategory(a, category));
  }

  async setLocation(tenantId: TenantId, id: Uuid, location: string | null): Promise<Asset> {
    return this.mutate(tenantId, id, (a) => setAssetLocation(a, location));
  }

  async assignCustodian(tenantId: TenantId, id: Uuid, custodianId: Uuid | null): Promise<Asset> {
    if (custodianId !== null && !(await this.employees.exists(tenantId, custodianId))) {
      throw new EmployeeNotFoundForResourceError(custodianId);
    }
    return this.mutate(tenantId, id, (a) => assignCustodian(a, custodianId));
  }

  async sendToMaintenance(tenantId: TenantId, id: Uuid): Promise<Asset> {
    return this.mutate(tenantId, id, (a) => sendAssetToMaintenance(a));
  }

  async returnFromMaintenance(tenantId: TenantId, id: Uuid): Promise<Asset> {
    return this.mutate(tenantId, id, (a) => returnAssetFromMaintenance(a));
  }

  async retire(tenantId: TenantId, id: Uuid): Promise<Asset> {
    const updated = retireAsset(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(assetRetired(updated));
    return updated;
  }

  async dispose(tenantId: TenantId, id: Uuid): Promise<Asset> {
    const updated = disposeAsset(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(assetDisposed(updated));
    return updated;
  }

  /** The asset's depreciation (accumulated + net book value) as of a date. */
  async depreciationAsOf(
    tenantId: TenantId,
    id: Uuid,
    asOfDate: string,
  ): Promise<DepreciationResult> {
    return assetDepreciationAsOf(await this.require(tenantId, id), asOfDate);
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Asset> {
    return this.require(tenantId, id);
  }

  async getByTag(tenantId: TenantId, assetTag: string): Promise<Asset> {
    const asset = await this.repository.findByTag(tenantId, assetTag);
    if (!asset) {
      throw new AssetNotFoundError(assetTag);
    }
    return asset;
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Asset[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  async listForCustodian(tenantId: TenantId, custodianId: Uuid): Promise<Asset[]> {
    return this.repository.listByCustodian(tenantId, custodianId);
  }

  async list(tenantId: TenantId): Promise<Asset[]> {
    return this.repository.listByTenant(tenantId);
  }

  private async mutate(tenantId: TenantId, id: Uuid, fn: (asset: Asset) => Asset): Promise<Asset> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Asset> {
    const asset = await this.repository.findById(tenantId, id);
    if (!asset) {
      throw new AssetNotFoundError(id);
    }
    return asset;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
