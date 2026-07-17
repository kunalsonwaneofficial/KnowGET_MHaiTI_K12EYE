import type { TenantId, Uuid } from "@knowget/types";
import type { Organization } from "./organization";

/**
 * Storage contract for organizations. Every method is tenant-scoped: the tenant
 * is an explicit parameter (defense-in-depth) and the persistence adapter also
 * enforces isolation with PostgreSQL RLS. In-memory default; a Prisma-backed
 * implementation is wired at the composition root.
 */
export interface OrganizationRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Organization | null>;
  findByCode(tenantId: TenantId, code: string): Promise<Organization | null>;
  listByTenant(tenantId: TenantId): Promise<Organization[]>;
  findChildren(tenantId: TenantId, parentId: Uuid): Promise<Organization[]>;
  save(organization: Organization): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

export class InMemoryOrganizationRepository implements OrganizationRepository {
  private readonly byId = new Map<string, Organization>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Organization | null> {
    const organization = this.byId.get(id);
    return organization && organization.tenantId === tenantId ? organization : null;
  }

  async findByCode(tenantId: TenantId, code: string): Promise<Organization | null> {
    for (const organization of this.byId.values()) {
      if (organization.tenantId === tenantId && organization.code === code) {
        return organization;
      }
    }
    return null;
  }

  async listByTenant(tenantId: TenantId): Promise<Organization[]> {
    return [...this.byId.values()].filter((o) => o.tenantId === tenantId);
  }

  async findChildren(tenantId: TenantId, parentId: Uuid): Promise<Organization[]> {
    return [...this.byId.values()].filter(
      (o) => o.tenantId === tenantId && o.parentId === parentId,
    );
  }

  async save(organization: Organization): Promise<void> {
    this.byId.set(organization.id, organization);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const organization = this.byId.get(id);
    if (organization && organization.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
