import type { TenantId, Uuid } from "@knowget/types";
import type { Prospect } from "./prospect";

/**
 * Read model over the person domain (P2-D01-M02): does this person exist in the
 * tenant? Every learner — prospect, applicant, student — is a Person; the lifecycle
 * links to it and never depends on `@knowget/person` directly.
 */
export interface PersonDirectory {
  exists(tenantId: TenantId, personId: Uuid): Promise<boolean>;
}

/**
 * Read model over the organization domain (P2-D01-M01): does this organization
 * node (campus / institution) exist in the tenant? Learners attach to it.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/** Storage contract for prospects. Tenant-scoped (explicit argument + RLS). */
export interface ProspectRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Prospect | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Prospect[]>;
  listByTenant(tenantId: TenantId): Promise<Prospect[]>;
  save(prospect: Prospect): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link ProspectRepository} — the default for tests and bootstrap. */
export class InMemoryProspectRepository implements ProspectRepository {
  private readonly byId = new Map<string, Prospect>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Prospect | null> {
    const prospect = this.byId.get(id);
    return prospect && prospect.tenantId === tenantId ? prospect : null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Prospect[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Prospect[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(prospect: Prospect): Promise<void> {
    this.byId.set(prospect.id, prospect);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const prospect = this.byId.get(id);
    if (prospect && prospect.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
