import type { TenantId, Uuid } from "@knowget/types";
import type { Hostel } from "./hostel";
import type { Warden } from "./warden";

/**
 * Read model over the organization domain (P2-D01-M01): does this organization node exist in the tenant?
 * Hostels, rooms and roll calls attach to it; the residential domain links to it and never depends on
 * `@knowget/organization` directly.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/**
 * Read model over the workforce domain (P2-D12): a warden is an Employee. `exists` answers presence;
 * `organizationOf` resolves the employee's organization (or `null` if unknown) so a warden derives its
 * organization from the staff member it links to. The residential domain links to workforce and never
 * depends on `@knowget/workforce` directly.
 */
export interface EmployeeDirectory {
  exists(tenantId: TenantId, employeeId: Uuid): Promise<boolean>;
  organizationOf(tenantId: TenantId, employeeId: Uuid): Promise<Uuid | null>;
}

/**
 * Read model over the student-lifecycle domain (P2-D03): a resident is a Student. `exists` answers
 * presence; `organizationOf` resolves the student's organization so a residential record derives its org
 * from the student it serves. The residential domain links to student-lifecycle and never depends on
 * `@knowget/student-lifecycle` directly.
 */
export interface StudentDirectory {
  exists(tenantId: TenantId, studentId: Uuid): Promise<boolean>;
  organizationOf(tenantId: TenantId, studentId: Uuid): Promise<Uuid | null>;
}

/** Storage contract for hostels. Tenant-scoped (explicit argument + RLS). */
export interface HostelRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Hostel | null>;
  findByCode(tenantId: TenantId, code: string): Promise<Hostel | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Hostel[]>;
  listByTenant(tenantId: TenantId): Promise<Hostel[]>;
  save(hostel: Hostel): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link HostelRepository} — the default for tests and bootstrap. */
export class InMemoryHostelRepository implements HostelRepository {
  private readonly byId = new Map<string, Hostel>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Hostel | null> {
    const hostel = this.byId.get(id);
    return hostel && hostel.tenantId === tenantId ? hostel : null;
  }

  async findByCode(tenantId: TenantId, code: string): Promise<Hostel | null> {
    return [...this.byId.values()].find((h) => h.tenantId === tenantId && h.code === code) ?? null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Hostel[]> {
    return [...this.byId.values()].filter(
      (h) => h.tenantId === tenantId && h.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Hostel[]> {
    return [...this.byId.values()].filter((h) => h.tenantId === tenantId);
  }

  async save(hostel: Hostel): Promise<void> {
    this.byId.set(hostel.id, hostel);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const hostel = this.byId.get(id);
    if (hostel && hostel.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for wardens. Tenant-scoped (explicit argument + RLS). */
export interface WardenRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Warden | null>;
  findByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<Warden | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Warden[]>;
  listByTenant(tenantId: TenantId): Promise<Warden[]>;
  save(warden: Warden): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link WardenRepository} — the default for tests and bootstrap. */
export class InMemoryWardenRepository implements WardenRepository {
  private readonly byId = new Map<string, Warden>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Warden | null> {
    const warden = this.byId.get(id);
    return warden && warden.tenantId === tenantId ? warden : null;
  }

  async findByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<Warden | null> {
    return (
      [...this.byId.values()].find((w) => w.tenantId === tenantId && w.employeeId === employeeId) ??
      null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Warden[]> {
    return [...this.byId.values()].filter(
      (w) => w.tenantId === tenantId && w.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Warden[]> {
    return [...this.byId.values()].filter((w) => w.tenantId === tenantId);
  }

  async save(warden: Warden): Promise<void> {
    this.byId.set(warden.id, warden);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const warden = this.byId.get(id);
    if (warden && warden.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
