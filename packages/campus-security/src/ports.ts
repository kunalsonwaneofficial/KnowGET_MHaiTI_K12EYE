import type { TenantId, Uuid } from "@knowget/types";
import type { AccessCredential } from "./access-credential";
import type { AccessZone } from "./access-zone";
import type { Visit } from "./visit";
import type { Visitor } from "./visitor";

/**
 * Read model over the organization domain (P2-D01-M01): does this organization node exist in the tenant?
 * Every security record attaches to it; the domain links to it and never depends on `@knowget/organization`
 * directly.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/**
 * Read model over the person domain (P2-D01-M02): does this person exist? A visit host, an incident reporter
 * and a person-type credential holder are Persons; the domain links to them and never re-models them.
 */
export interface PersonDirectory {
  exists(tenantId: TenantId, personId: Uuid): Promise<boolean>;
}

/**
 * Read model over the workforce domain (P2-D12): an incident assignee, a drill conductor and an
 * employee-type credential holder are Employees. `exists` answers presence; `organizationOf` resolves the
 * employee's organization (or `null`). The domain links to workforce and never depends on it directly.
 */
export interface EmployeeDirectory {
  exists(tenantId: TenantId, employeeId: Uuid): Promise<boolean>;
  organizationOf(tenantId: TenantId, employeeId: Uuid): Promise<Uuid | null>;
}

/** Storage contract for access zones. Tenant-scoped (explicit argument + RLS). */
export interface AccessZoneRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<AccessZone | null>;
  findByCode(tenantId: TenantId, code: string): Promise<AccessZone | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AccessZone[]>;
  listByTenant(tenantId: TenantId): Promise<AccessZone[]>;
  save(zone: AccessZone): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link AccessZoneRepository} — the default for tests and bootstrap. */
export class InMemoryAccessZoneRepository implements AccessZoneRepository {
  private readonly byId = new Map<string, AccessZone>();

  async findById(tenantId: TenantId, id: Uuid): Promise<AccessZone | null> {
    const zone = this.byId.get(id);
    return zone && zone.tenantId === tenantId ? zone : null;
  }

  async findByCode(tenantId: TenantId, code: string): Promise<AccessZone | null> {
    return [...this.byId.values()].find((z) => z.tenantId === tenantId && z.code === code) ?? null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AccessZone[]> {
    return [...this.byId.values()].filter(
      (z) => z.tenantId === tenantId && z.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<AccessZone[]> {
    return [...this.byId.values()].filter((z) => z.tenantId === tenantId);
  }

  async save(zone: AccessZone): Promise<void> {
    this.byId.set(zone.id, zone);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const zone = this.byId.get(id);
    if (zone && zone.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for visitors. Tenant-scoped (explicit argument + RLS). */
export interface VisitorRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Visitor | null>;
  findByCode(tenantId: TenantId, code: string): Promise<Visitor | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Visitor[]>;
  listByTenant(tenantId: TenantId): Promise<Visitor[]>;
  save(visitor: Visitor): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link VisitorRepository} — the default for tests and bootstrap. */
export class InMemoryVisitorRepository implements VisitorRepository {
  private readonly byId = new Map<string, Visitor>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Visitor | null> {
    const visitor = this.byId.get(id);
    return visitor && visitor.tenantId === tenantId ? visitor : null;
  }

  async findByCode(tenantId: TenantId, code: string): Promise<Visitor | null> {
    return [...this.byId.values()].find((v) => v.tenantId === tenantId && v.code === code) ?? null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Visitor[]> {
    return [...this.byId.values()].filter(
      (v) => v.tenantId === tenantId && v.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Visitor[]> {
    return [...this.byId.values()].filter((v) => v.tenantId === tenantId);
  }

  async save(visitor: Visitor): Promise<void> {
    this.byId.set(visitor.id, visitor);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const visitor = this.byId.get(id);
    if (visitor && visitor.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

const OPEN_VISITS = new Set<string>(["requested", "approved", "checked_in"]);

/**
 * Storage contract for visits. Tenant-scoped (explicit argument + RLS). `listOnSiteByZone` returns the
 * checked-in visits in a zone — exactly what the presence engine counts as on-site.
 */
export interface VisitRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Visit | null>;
  listByVisitor(tenantId: TenantId, visitorId: Uuid): Promise<Visit[]>;
  listByHost(tenantId: TenantId, hostPersonId: Uuid): Promise<Visit[]>;
  listByZone(tenantId: TenantId, zoneId: Uuid): Promise<Visit[]>;
  listOnSiteByZone(tenantId: TenantId, zoneId: Uuid): Promise<Visit[]>;
  listOpen(tenantId: TenantId): Promise<Visit[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Visit[]>;
  listByTenant(tenantId: TenantId): Promise<Visit[]>;
  save(visit: Visit): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link VisitRepository} — the default for tests and bootstrap. */
export class InMemoryVisitRepository implements VisitRepository {
  private readonly byId = new Map<string, Visit>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Visit | null> {
    const visit = this.byId.get(id);
    return visit && visit.tenantId === tenantId ? visit : null;
  }

  async listByVisitor(tenantId: TenantId, visitorId: Uuid): Promise<Visit[]> {
    return [...this.byId.values()].filter(
      (v) => v.tenantId === tenantId && v.visitorId === visitorId,
    );
  }

  async listByHost(tenantId: TenantId, hostPersonId: Uuid): Promise<Visit[]> {
    return [...this.byId.values()].filter(
      (v) => v.tenantId === tenantId && v.hostPersonId === hostPersonId,
    );
  }

  async listByZone(tenantId: TenantId, zoneId: Uuid): Promise<Visit[]> {
    return [...this.byId.values()].filter((v) => v.tenantId === tenantId && v.zoneId === zoneId);
  }

  async listOnSiteByZone(tenantId: TenantId, zoneId: Uuid): Promise<Visit[]> {
    return [...this.byId.values()].filter(
      (v) => v.tenantId === tenantId && v.zoneId === zoneId && v.status === "checked_in",
    );
  }

  async listOpen(tenantId: TenantId): Promise<Visit[]> {
    return [...this.byId.values()].filter(
      (v) => v.tenantId === tenantId && OPEN_VISITS.has(v.status),
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Visit[]> {
    return [...this.byId.values()].filter(
      (v) => v.tenantId === tenantId && v.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Visit[]> {
    return [...this.byId.values()].filter((v) => v.tenantId === tenantId);
  }

  async save(visit: Visit): Promise<void> {
    this.byId.set(visit.id, visit);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const visit = this.byId.get(id);
    if (visit && visit.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/**
 * Storage contract for access credentials. Tenant-scoped (explicit argument + RLS).
 * `listActiveByGrantedZone` returns the active credentials that grant a given zone — the profile's
 * active-credential count per zone.
 */
export interface AccessCredentialRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<AccessCredential | null>;
  findByNumber(tenantId: TenantId, credentialNumber: string): Promise<AccessCredential | null>;
  listByHolder(tenantId: TenantId, holderType: string, holderId: Uuid): Promise<AccessCredential[]>;
  listActiveByGrantedZone(tenantId: TenantId, zoneId: Uuid): Promise<AccessCredential[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AccessCredential[]>;
  listByTenant(tenantId: TenantId): Promise<AccessCredential[]>;
  save(credential: AccessCredential): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link AccessCredentialRepository} — the default for tests and bootstrap. */
export class InMemoryAccessCredentialRepository implements AccessCredentialRepository {
  private readonly byId = new Map<string, AccessCredential>();

  async findById(tenantId: TenantId, id: Uuid): Promise<AccessCredential | null> {
    const credential = this.byId.get(id);
    return credential && credential.tenantId === tenantId ? credential : null;
  }

  async findByNumber(
    tenantId: TenantId,
    credentialNumber: string,
  ): Promise<AccessCredential | null> {
    return (
      [...this.byId.values()].find(
        (c) => c.tenantId === tenantId && c.credentialNumber === credentialNumber,
      ) ?? null
    );
  }

  async listByHolder(
    tenantId: TenantId,
    holderType: string,
    holderId: Uuid,
  ): Promise<AccessCredential[]> {
    return [...this.byId.values()].filter(
      (c) => c.tenantId === tenantId && c.holderType === holderType && c.holderId === holderId,
    );
  }

  async listActiveByGrantedZone(tenantId: TenantId, zoneId: Uuid): Promise<AccessCredential[]> {
    return [...this.byId.values()].filter(
      (c) => c.tenantId === tenantId && c.status === "active" && c.grantedZoneIds.includes(zoneId),
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AccessCredential[]> {
    return [...this.byId.values()].filter(
      (c) => c.tenantId === tenantId && c.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<AccessCredential[]> {
    return [...this.byId.values()].filter((c) => c.tenantId === tenantId);
  }

  async save(credential: AccessCredential): Promise<void> {
    this.byId.set(credential.id, credential);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const credential = this.byId.get(id);
    if (credential && credential.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
