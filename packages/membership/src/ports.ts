import type { TenantId, Uuid } from "@knowget/types";
import { isActiveMembership, type Membership } from "./membership";

/**
 * Storage contract for memberships. Tenant-scoped (explicit argument + RLS in
 * the adapter). `findActiveByPersonAndOrg` powers the "one active membership per
 * person per organization" invariant.
 */
export interface MembershipRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Membership | null>;
  findByPerson(tenantId: TenantId, personId: Uuid): Promise<Membership[]>;
  findByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Membership[]>;
  findActiveByPersonAndOrg(
    tenantId: TenantId,
    personId: Uuid,
    organizationId: Uuid,
  ): Promise<Membership | null>;
  listByTenant(tenantId: TenantId): Promise<Membership[]>;
  save(membership: Membership): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** Read model over the person domain: does this person exist in the tenant? */
export interface PersonDirectory {
  exists(tenantId: TenantId, personId: Uuid): Promise<boolean>;
}

/** Read model over the organization domain: does this org exist in the tenant? */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/**
 * Read model over the role catalogue: does an active role with this name exist
 * in the tenant? Optional in the service — when supplied, membership role names
 * are validated against the tenant's catalogue (P2-D01-M05).
 */
export interface RoleDirectory {
  roleExists(tenantId: TenantId, roleName: string): Promise<boolean>;
}

/** In-memory {@link MembershipRepository} — the default for tests and bootstrap. */
export class InMemoryMembershipRepository implements MembershipRepository {
  private readonly byId = new Map<string, Membership>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Membership | null> {
    const membership = this.byId.get(id);
    return membership && membership.tenantId === tenantId ? membership : null;
  }

  async findByPerson(tenantId: TenantId, personId: Uuid): Promise<Membership[]> {
    return [...this.byId.values()].filter(
      (m) => m.tenantId === tenantId && m.personId === personId,
    );
  }

  async findByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Membership[]> {
    return [...this.byId.values()].filter(
      (m) => m.tenantId === tenantId && m.organizationId === organizationId,
    );
  }

  async findActiveByPersonAndOrg(
    tenantId: TenantId,
    personId: Uuid,
    organizationId: Uuid,
  ): Promise<Membership | null> {
    for (const membership of this.byId.values()) {
      if (
        membership.tenantId === tenantId &&
        membership.personId === personId &&
        membership.organizationId === organizationId &&
        isActiveMembership(membership)
      ) {
        return membership;
      }
    }
    return null;
  }

  async listByTenant(tenantId: TenantId): Promise<Membership[]> {
    return [...this.byId.values()].filter((m) => m.tenantId === tenantId);
  }

  async save(membership: Membership): Promise<void> {
    this.byId.set(membership.id, membership);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const membership = this.byId.get(id);
    if (membership && membership.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
