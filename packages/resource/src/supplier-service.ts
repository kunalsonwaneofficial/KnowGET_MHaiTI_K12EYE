import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateSupplierCodeError,
  OrganizationNotFoundForResourceError,
  SupplierNotFoundError,
} from "./errors";
import {
  supplierBlacklisted,
  supplierRegistered,
  supplierReinstated,
  supplierSuspended,
} from "./resource-events";
import type { OrganizationDirectory, SupplierRepository } from "./ports";
import {
  blacklistSupplier,
  type CreateSupplierParams,
  createSupplier,
  reinstateSupplier,
  renameSupplier,
  setSupplierCategory,
  setSupplierContact,
  type Supplier,
  suspendSupplier,
} from "./supplier";

export interface SupplierServiceDeps {
  readonly repository: SupplierRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for suppliers — the vendor master. Registers a supplier (validating the
 * organization and a unique code), edits its details, and drives the `active ↔ suspended` /
 * `→ blacklisted` lifecycle, publishing the supplier events.
 */
export class SupplierService {
  private readonly repository: SupplierRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: SupplierServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async create(input: CreateSupplierParams): Promise<Supplier> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForResourceError(input.organizationId);
    }
    if (await this.repository.findByCode(input.tenantId, input.code.trim())) {
      throw new DuplicateSupplierCodeError(input.code.trim());
    }
    const supplier = createSupplier(input);
    await this.repository.save(supplier);
    await this.emit(supplierRegistered(supplier));
    return supplier;
  }

  async rename(tenantId: TenantId, id: Uuid, name: string): Promise<Supplier> {
    return this.mutate(tenantId, id, (s) => renameSupplier(s, name));
  }

  async setCategory(tenantId: TenantId, id: Uuid, category: string | null): Promise<Supplier> {
    return this.mutate(tenantId, id, (s) => setSupplierCategory(s, category));
  }

  async setContact(
    tenantId: TenantId,
    id: Uuid,
    contactEmail: string | null,
    contactPhone: string | null,
  ): Promise<Supplier> {
    return this.mutate(tenantId, id, (s) => setSupplierContact(s, contactEmail, contactPhone));
  }

  async suspend(tenantId: TenantId, id: Uuid): Promise<Supplier> {
    const updated = suspendSupplier(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(supplierSuspended(updated));
    return updated;
  }

  async reinstate(tenantId: TenantId, id: Uuid): Promise<Supplier> {
    const updated = reinstateSupplier(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(supplierReinstated(updated));
    return updated;
  }

  async blacklist(tenantId: TenantId, id: Uuid): Promise<Supplier> {
    const updated = blacklistSupplier(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(supplierBlacklisted(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Supplier> {
    return this.require(tenantId, id);
  }

  async getByCode(tenantId: TenantId, code: string): Promise<Supplier> {
    const supplier = await this.repository.findByCode(tenantId, code);
    if (!supplier) {
      throw new SupplierNotFoundError(code);
    }
    return supplier;
  }

  async list(tenantId: TenantId): Promise<Supplier[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Supplier[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (supplier: Supplier) => Supplier,
  ): Promise<Supplier> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Supplier> {
    const supplier = await this.repository.findById(tenantId, id);
    if (!supplier) {
      throw new SupplierNotFoundError(id);
    }
    return supplier;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
