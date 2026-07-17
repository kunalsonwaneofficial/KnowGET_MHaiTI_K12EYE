import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  CircularHierarchyError,
  DuplicateOrganizationCodeError,
  OrganizationNotFoundError,
} from "./errors";
import { buildTree, type OrganizationNode, wouldCreateCycle } from "./hierarchy";
import {
  type CreateOrganizationParams,
  createOrganization,
  type Organization,
  type OrganizationStatus,
  renameOrganization,
  reparentOrganization,
  transitionStatus,
} from "./organization";
import {
  organizationCreated,
  organizationMoved,
  organizationRenamed,
  organizationStatusChanged,
} from "./organization-events";
import type { OrganizationRepository } from "./organization-repository";

/**
 * Application service for the organization domain. Enforces the invariants
 * (code uniqueness within a tenant, parent existence, acyclic hierarchy, the
 * status state machine), persists through the repository port, and publishes a
 * domain event for every state change. Persona-agnostic and transport-agnostic.
 */
export class OrganizationService {
  constructor(
    private readonly repository: OrganizationRepository,
    private readonly events?: Pick<EventBus, "publish">,
  ) {}

  async create(input: CreateOrganizationParams): Promise<Organization> {
    if (await this.repository.findByCode(input.tenantId, input.code)) {
      throw new DuplicateOrganizationCodeError(input.code);
    }
    if (input.parentId !== null && input.parentId !== undefined) {
      await this.require(input.tenantId, input.parentId);
    }
    const organization = createOrganization(input);
    await this.repository.save(organization);
    await this.emit(organizationCreated(organization));
    return organization;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Organization> {
    return this.require(tenantId, id);
  }

  async list(tenantId: TenantId): Promise<Organization[]> {
    return this.repository.listByTenant(tenantId);
  }

  async tree(tenantId: TenantId): Promise<OrganizationNode[]> {
    return buildTree(await this.repository.listByTenant(tenantId));
  }

  async rename(tenantId: TenantId, id: Uuid, name: string): Promise<Organization> {
    const renamed = renameOrganization(await this.require(tenantId, id), name);
    await this.repository.save(renamed);
    await this.emit(organizationRenamed(renamed));
    return renamed;
  }

  async move(tenantId: TenantId, id: Uuid, newParentId: Uuid | null): Promise<Organization> {
    const organization = await this.require(tenantId, id);
    if (newParentId !== null) {
      await this.require(tenantId, newParentId);
      const all = await this.repository.listByTenant(tenantId);
      if (wouldCreateCycle(all, id, newParentId)) {
        throw new CircularHierarchyError();
      }
    }
    const moved = reparentOrganization(organization, newParentId);
    await this.repository.save(moved);
    await this.emit(organizationMoved(moved));
    return moved;
  }

  async setStatus(tenantId: TenantId, id: Uuid, to: OrganizationStatus): Promise<Organization> {
    const organization = await this.require(tenantId, id);
    const from = organization.status;
    const updated = transitionStatus(organization, to);
    await this.repository.save(updated);
    await this.emit(organizationStatusChanged(updated, from));
    return updated;
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    await this.require(tenantId, id);
    await this.repository.remove(tenantId, id);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Organization> {
    const organization = await this.repository.findById(tenantId, id);
    if (!organization) {
      throw new OrganizationNotFoundError(id);
    }
    return organization;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
