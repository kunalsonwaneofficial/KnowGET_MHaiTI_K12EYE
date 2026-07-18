import type { TenantId, Uuid } from "@knowget/types";
import type { Committee } from "./committee";
import type { Delegation } from "./delegation";
import type { GovernanceBody } from "./governance-body";
import type { GovernanceCalendarEntry } from "./governance-calendar";
import type { Policy, PolicyAcknowledgment } from "./policy";
import type { Resolution } from "./resolution";

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

/** Storage contract for policies. Tenant-scoped (explicit argument + RLS). */
export interface PolicyRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Policy | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Policy[]>;
  /** Published (in-force) policies for an organization node. */
  listPublishedByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Policy[]>;
  listByTenant(tenantId: TenantId): Promise<Policy[]>;
  save(policy: Policy): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** Storage contract for policy acknowledgments. Tenant-scoped. */
export interface PolicyAcknowledgmentRepository {
  save(acknowledgment: PolicyAcknowledgment): Promise<void>;
  listByPolicy(tenantId: TenantId, policyId: Uuid): Promise<PolicyAcknowledgment[]>;
  exists(tenantId: TenantId, policyId: Uuid, personId: Uuid, version: number): Promise<boolean>;
}

/** In-memory {@link PolicyRepository} — the default for tests and bootstrap. */
export class InMemoryPolicyRepository implements PolicyRepository {
  private readonly byId = new Map<string, Policy>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Policy | null> {
    const policy = this.byId.get(id);
    return policy && policy.tenantId === tenantId ? policy : null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Policy[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.organizationId === organizationId,
    );
  }

  async listPublishedByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Policy[]> {
    return (await this.listByOrganization(tenantId, organizationId)).filter(
      (p) => p.status === "published",
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Policy[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(policy: Policy): Promise<void> {
    this.byId.set(policy.id, policy);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const policy = this.byId.get(id);
    if (policy && policy.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** In-memory {@link PolicyAcknowledgmentRepository} — the default for tests. */
export class InMemoryPolicyAcknowledgmentRepository implements PolicyAcknowledgmentRepository {
  private readonly entries: PolicyAcknowledgment[] = [];

  async save(acknowledgment: PolicyAcknowledgment): Promise<void> {
    this.entries.push(acknowledgment);
  }

  async listByPolicy(tenantId: TenantId, policyId: Uuid): Promise<PolicyAcknowledgment[]> {
    return this.entries.filter((a) => a.tenantId === tenantId && a.policyId === policyId);
  }

  async exists(
    tenantId: TenantId,
    policyId: Uuid,
    personId: Uuid,
    version: number,
  ): Promise<boolean> {
    return this.entries.some(
      (a) =>
        a.tenantId === tenantId &&
        a.policyId === policyId &&
        a.personId === personId &&
        a.version === version,
    );
  }
}

/** Storage contract for delegations of authority. Tenant-scoped. */
export interface DelegationRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Delegation | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Delegation[]>;
  listByDelegate(tenantId: TenantId, delegateId: Uuid): Promise<Delegation[]>;
  listByTenant(tenantId: TenantId): Promise<Delegation[]>;
  save(delegation: Delegation): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link DelegationRepository} — the default for tests and bootstrap. */
export class InMemoryDelegationRepository implements DelegationRepository {
  private readonly byId = new Map<string, Delegation>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Delegation | null> {
    const delegation = this.byId.get(id);
    return delegation && delegation.tenantId === tenantId ? delegation : null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Delegation[]> {
    return [...this.byId.values()].filter(
      (d) => d.tenantId === tenantId && d.organizationId === organizationId,
    );
  }

  async listByDelegate(tenantId: TenantId, delegateId: Uuid): Promise<Delegation[]> {
    return [...this.byId.values()].filter(
      (d) => d.tenantId === tenantId && d.delegateId === delegateId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Delegation[]> {
    return [...this.byId.values()].filter((d) => d.tenantId === tenantId);
  }

  async save(delegation: Delegation): Promise<void> {
    this.byId.set(delegation.id, delegation);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const delegation = this.byId.get(id);
    if (delegation && delegation.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for resolutions. Tenant-scoped. */
export interface ResolutionRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Resolution | null>;
  listByGovernanceBody(tenantId: TenantId, governanceBodyId: Uuid): Promise<Resolution[]>;
  listByTenant(tenantId: TenantId): Promise<Resolution[]>;
  save(resolution: Resolution): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link ResolutionRepository} — the default for tests and bootstrap. */
export class InMemoryResolutionRepository implements ResolutionRepository {
  private readonly byId = new Map<string, Resolution>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Resolution | null> {
    const resolution = this.byId.get(id);
    return resolution && resolution.tenantId === tenantId ? resolution : null;
  }

  async listByGovernanceBody(tenantId: TenantId, governanceBodyId: Uuid): Promise<Resolution[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.governanceBodyId === governanceBodyId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Resolution[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  async save(resolution: Resolution): Promise<void> {
    this.byId.set(resolution.id, resolution);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const resolution = this.byId.get(id);
    if (resolution && resolution.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for governance calendar entries. Tenant-scoped. */
export interface GovernanceCalendarRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<GovernanceCalendarEntry | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<GovernanceCalendarEntry[]>;
  listByTenant(tenantId: TenantId): Promise<GovernanceCalendarEntry[]>;
  save(entry: GovernanceCalendarEntry): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link GovernanceCalendarRepository} — the default for tests. */
export class InMemoryGovernanceCalendarRepository implements GovernanceCalendarRepository {
  private readonly byId = new Map<string, GovernanceCalendarEntry>();

  async findById(tenantId: TenantId, id: Uuid): Promise<GovernanceCalendarEntry | null> {
    const entry = this.byId.get(id);
    return entry && entry.tenantId === tenantId ? entry : null;
  }

  async listByOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<GovernanceCalendarEntry[]> {
    return [...this.byId.values()].filter(
      (e) => e.tenantId === tenantId && e.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<GovernanceCalendarEntry[]> {
    return [...this.byId.values()].filter((e) => e.tenantId === tenantId);
  }

  async save(entry: GovernanceCalendarEntry): Promise<void> {
    this.byId.set(entry.id, entry);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const entry = this.byId.get(id);
    if (entry && entry.tenantId === tenantId) {
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
