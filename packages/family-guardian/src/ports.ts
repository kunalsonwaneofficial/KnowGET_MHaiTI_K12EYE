import type { TenantId, Uuid } from "@knowget/types";
import type { Family } from "./family";

/**
 * Read model over the person domain (P2-D01-M02): does this person exist in the
 * tenant? Guardians and household members are always a Person; the platform links
 * identity and never depends on `@knowget/person` directly.
 */
export interface PersonDirectory {
  exists(tenantId: TenantId, personId: Uuid): Promise<boolean>;
}

/**
 * Read model over the organization domain (P2-D01-M01): does this organization node
 * (campus / institution) exist in the tenant? Families register against it.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/** Storage contract for families. Tenant-scoped (explicit argument + RLS). */
export interface FamilyRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Family | null>;
  findByFamilyNumber(tenantId: TenantId, familyNumber: string): Promise<Family | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Family[]>;
  listByTenant(tenantId: TenantId): Promise<Family[]>;
  save(family: Family): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link FamilyRepository} — the default for tests and bootstrap. */
export class InMemoryFamilyRepository implements FamilyRepository {
  private readonly byId = new Map<string, Family>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Family | null> {
    const family = this.byId.get(id);
    return family && family.tenantId === tenantId ? family : null;
  }

  async findByFamilyNumber(tenantId: TenantId, familyNumber: string): Promise<Family | null> {
    return (
      [...this.byId.values()].find(
        (f) => f.tenantId === tenantId && f.familyNumber === familyNumber,
      ) ?? null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Family[]> {
    return [...this.byId.values()].filter(
      (f) => f.tenantId === tenantId && f.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Family[]> {
    return [...this.byId.values()].filter((f) => f.tenantId === tenantId);
  }

  async save(family: Family): Promise<void> {
    this.byId.set(family.id, family);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const family = this.byId.get(id);
    if (family && family.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
