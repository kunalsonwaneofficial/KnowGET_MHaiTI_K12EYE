import type { TenantId, Uuid } from "@knowget/types";
import {
  DuplicateResourceError,
  OrganizationNotFoundForSchedulingError,
  ResourceNotFoundError,
} from "./errors";
import type { OrganizationDirectory, ResourceRepository } from "./ports";
import type { AvailabilityWindow, ResourceKind } from "./resource-kind";
import {
  createResource,
  markResourceAvailable,
  markResourceMaintenance,
  renameResource,
  type Resource,
  retireResource,
  setAvailabilityWindows,
  setResourceCapacity,
  setResourceLocation,
} from "./resource";

export interface ResourceServiceDeps {
  readonly repository: ResourceRepository;
  readonly organizations: OrganizationDirectory;
}

export interface CreateResourceInput {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly kind: ResourceKind;
  readonly capacity?: number | null;
  readonly location?: string | null;
  readonly availabilityWindows?: readonly AvailabilityWindow[];
}

/**
 * Application service for schedulable resources. Registers at most one resource per
 * (organization, code) against a validated Organization and manages its attributes and
 * available → maintenance → retired lifecycle. Resources carry no domain event of their own
 * (allocation is where the scheduling events live).
 */
export class ResourceService {
  private readonly repository: ResourceRepository;
  private readonly organizations: OrganizationDirectory;

  constructor(deps: ResourceServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
  }

  async create(input: CreateResourceInput): Promise<Resource> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForSchedulingError(input.organizationId);
    }
    if (await this.repository.findByCode(input.tenantId, input.organizationId, input.code)) {
      throw new DuplicateResourceError(input.organizationId, input.code);
    }
    const resource = createResource(input);
    await this.repository.save(resource);
    return resource;
  }

  async rename(tenantId: TenantId, id: Uuid, name: string): Promise<Resource> {
    return this.mutate(tenantId, id, (r) => renameResource(r, name));
  }

  async setCapacity(tenantId: TenantId, id: Uuid, capacity: number | null): Promise<Resource> {
    return this.mutate(tenantId, id, (r) => setResourceCapacity(r, capacity));
  }

  async setLocation(tenantId: TenantId, id: Uuid, location: string | null): Promise<Resource> {
    return this.mutate(tenantId, id, (r) => setResourceLocation(r, location));
  }

  async setAvailability(
    tenantId: TenantId,
    id: Uuid,
    windows: readonly AvailabilityWindow[],
  ): Promise<Resource> {
    return this.mutate(tenantId, id, (r) => setAvailabilityWindows(r, windows));
  }

  async markMaintenance(tenantId: TenantId, id: Uuid): Promise<Resource> {
    return this.mutate(tenantId, id, (r) => markResourceMaintenance(r));
  }

  async markAvailable(tenantId: TenantId, id: Uuid): Promise<Resource> {
    return this.mutate(tenantId, id, (r) => markResourceAvailable(r));
  }

  async retire(tenantId: TenantId, id: Uuid): Promise<Resource> {
    return this.mutate(tenantId, id, (r) => retireResource(r));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Resource> {
    return this.require(tenantId, id);
  }

  async getByCode(
    tenantId: TenantId,
    organizationId: Uuid,
    code: string,
  ): Promise<Resource | null> {
    return this.repository.findByCode(tenantId, organizationId, code);
  }

  async list(tenantId: TenantId): Promise<Resource[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Resource[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (resource: Resource) => Resource,
  ): Promise<Resource> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Resource> {
    const resource = await this.repository.findById(tenantId, id);
    if (!resource) {
      throw new ResourceNotFoundError(id);
    }
    return resource;
  }
}
