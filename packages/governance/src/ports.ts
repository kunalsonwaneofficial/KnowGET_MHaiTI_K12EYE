import type { TenantId, Uuid } from "@knowget/types";
import type { Committee } from "./committee";
import type { GovernanceBody } from "./governance-body";

/**
 * Storage contract for governance bodies. Tenant-scoped (explicit argument + RLS
 * in the adapter). `findChildren` powers the governance hierarchy.
 */
export interface GovernanceBodyRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<GovernanceBody | null>;
  findChildren(tenantId: TenantId, parentBodyId: Uuid): Promise<GovernanceBody[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<GovernanceBody[]>;
  listByTenant(tenantId: TenantId): Promise<GovernanceBody[]>;
  save(body: GovernanceBody): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/**
 * Read model over the organization domain (P2-D01-M01): does this organization
 * node exist in the tenant? Governance attaches to organization nodes, but the
 * governance domain never depends on the organization package directly.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/**
 * Read model over the person domain (P2-D01-M02): does this person exist in the
 * tenant? Committee members, and later delegates and voters, are Persons.
 */
export interface PersonDirectory {
  exists(tenantId: TenantId, personId: Uuid): Promise<boolean>;
}

/** Storage contract for committees. Tenant-scoped (explicit argument + RLS). */
export interface CommitteeRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Committee | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Committee[]>;
  listByGovernanceBody(tenantId: TenantId, governanceBodyId: Uuid): Promise<Committee[]>;
  listByTenant(tenantId: TenantId): Promise<Committee[]>;
  save(committee: Committee): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link CommitteeRepository} — the default for tests and bootstrap. */
export class InMemoryCommitteeRepository implements CommitteeRepository {
  private readonly byId = new Map<string, Committee>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Committee | null> {
    const committee = this.byId.get(id);
    return committee && committee.tenantId === tenantId ? committee : null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Committee[]> {
    return [...this.byId.values()].filter(
      (c) => c.tenantId === tenantId && c.organizationId === organizationId,
    );
  }

  async listByGovernanceBody(tenantId: TenantId, governanceBodyId: Uuid): Promise<Committee[]> {
    return [...this.byId.values()].filter(
      (c) => c.tenantId === tenantId && c.governanceBodyId === governanceBodyId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Committee[]> {
    return [...this.byId.values()].filter((c) => c.tenantId === tenantId);
  }

  async save(committee: Committee): Promise<void> {
    this.byId.set(committee.id, committee);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const committee = this.byId.get(id);
    if (committee && committee.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** In-memory {@link GovernanceBodyRepository} — the default for tests and bootstrap. */
export class InMemoryGovernanceBodyRepository implements GovernanceBodyRepository {
  private readonly byId = new Map<string, GovernanceBody>();

  async findById(tenantId: TenantId, id: Uuid): Promise<GovernanceBody | null> {
    const body = this.byId.get(id);
    return body && body.tenantId === tenantId ? body : null;
  }

  async findChildren(tenantId: TenantId, parentBodyId: Uuid): Promise<GovernanceBody[]> {
    return [...this.byId.values()].filter(
      (b) => b.tenantId === tenantId && b.parentBodyId === parentBodyId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<GovernanceBody[]> {
    return [...this.byId.values()].filter(
      (b) => b.tenantId === tenantId && b.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<GovernanceBody[]> {
    return [...this.byId.values()].filter((b) => b.tenantId === tenantId);
  }

  async save(body: GovernanceBody): Promise<void> {
    this.byId.set(body.id, body);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const body = this.byId.get(id);
    if (body && body.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
