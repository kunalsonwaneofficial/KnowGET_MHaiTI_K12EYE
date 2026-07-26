import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  type CatalogDigitalAssetParams,
  catalogDigitalAsset,
  type DigitalAsset,
  reactivateDigitalAsset,
  renameDigitalAsset,
  renewDigitalLicense,
  retireDigitalAsset,
  setDigitalAccess,
} from "./digital-asset";
import { DigitalAssetNotFoundError, OrganizationNotFoundForLibraryError } from "./errors";
import type { DigitalAssetRepository, OrganizationDirectory } from "./ports";
import {
  digitalCataloged,
  digitalLicenseRenewed,
  digitalReactivated,
  digitalRetired,
} from "./library-events";
import type { AccessModel } from "./library-value";

export interface DigitalAssetServiceDeps {
  readonly repository: DigitalAssetRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for digital learning assets. Catalogs an asset (validating the organization), edits
 * its access and licence, and drives the `active ↔ retired` lifecycle, publishing the digital-asset
 * events.
 */
export class DigitalAssetService {
  private readonly repository: DigitalAssetRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: DigitalAssetServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async catalog(input: CatalogDigitalAssetParams): Promise<DigitalAsset> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForLibraryError(input.organizationId);
    }
    const asset = catalogDigitalAsset(input);
    await this.repository.save(asset);
    await this.emit(digitalCataloged(asset));
    return asset;
  }

  async rename(tenantId: TenantId, id: Uuid, title: string): Promise<DigitalAsset> {
    return this.mutate(tenantId, id, (a) => renameDigitalAsset(a, title));
  }

  async setAccess(
    tenantId: TenantId,
    id: Uuid,
    accessModel: AccessModel,
    accessUrl: string | null,
    provider: string | null,
  ): Promise<DigitalAsset> {
    return this.mutate(tenantId, id, (a) => setDigitalAccess(a, accessModel, accessUrl, provider));
  }

  async renewLicense(
    tenantId: TenantId,
    id: Uuid,
    licenseExpiry: string | null,
  ): Promise<DigitalAsset> {
    const updated = renewDigitalLicense(await this.require(tenantId, id), licenseExpiry);
    await this.repository.save(updated);
    await this.emit(digitalLicenseRenewed(updated));
    return updated;
  }

  async retire(tenantId: TenantId, id: Uuid): Promise<DigitalAsset> {
    const updated = retireDigitalAsset(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(digitalRetired(updated));
    return updated;
  }

  async reactivate(tenantId: TenantId, id: Uuid): Promise<DigitalAsset> {
    const updated = reactivateDigitalAsset(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(digitalReactivated(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<DigitalAsset> {
    return this.require(tenantId, id);
  }

  async list(tenantId: TenantId): Promise<DigitalAsset[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<DigitalAsset[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (asset: DigitalAsset) => DigitalAsset,
  ): Promise<DigitalAsset> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<DigitalAsset> {
    const asset = await this.repository.findById(tenantId, id);
    if (!asset) {
      throw new DigitalAssetNotFoundError(id);
    }
    return asset;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
