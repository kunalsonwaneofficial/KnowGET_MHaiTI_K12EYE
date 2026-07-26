import type { TenantId, Uuid } from "@knowget/types";
import type { Clinician } from "./clinician";
import type { HealthCentre } from "./health-centre";

/**
 * Read model over the organization domain (P2-D01-M01): does this organization node exist in the tenant?
 * Health centres, clinicians and encounters attach to it; the domain links to it and never depends on
 * `@knowget/organization` directly.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/**
 * Read model over the workforce domain (P2-D12): a clinician is an Employee. `exists` answers presence;
 * `organizationOf` resolves the employee's organization (or `null` if unknown) so a clinician derives its
 * organization from the staff member it links to. The domain links to workforce and never depends on
 * `@knowget/workforce` directly.
 */
export interface EmployeeDirectory {
  exists(tenantId: TenantId, employeeId: Uuid): Promise<boolean>;
  organizationOf(tenantId: TenantId, employeeId: Uuid): Promise<Uuid | null>;
}

/**
 * Read model over the person domain (P2-D01-M02): does this person exist in the tenant? A patient is a
 * Person (a student, staff member, …); the domain validates existence and never duplicates the person, and
 * never depends on `@knowget/person` directly.
 */
export interface PersonDirectory {
  exists(tenantId: TenantId, personId: Uuid): Promise<boolean>;
}

/** Storage contract for health centres. Tenant-scoped (explicit argument + RLS). */
export interface HealthCentreRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<HealthCentre | null>;
  findByCode(tenantId: TenantId, code: string): Promise<HealthCentre | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<HealthCentre[]>;
  listByTenant(tenantId: TenantId): Promise<HealthCentre[]>;
  save(centre: HealthCentre): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link HealthCentreRepository} — the default for tests and bootstrap. */
export class InMemoryHealthCentreRepository implements HealthCentreRepository {
  private readonly byId = new Map<string, HealthCentre>();

  async findById(tenantId: TenantId, id: Uuid): Promise<HealthCentre | null> {
    const centre = this.byId.get(id);
    return centre && centre.tenantId === tenantId ? centre : null;
  }

  async findByCode(tenantId: TenantId, code: string): Promise<HealthCentre | null> {
    return [...this.byId.values()].find((c) => c.tenantId === tenantId && c.code === code) ?? null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<HealthCentre[]> {
    return [...this.byId.values()].filter(
      (c) => c.tenantId === tenantId && c.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<HealthCentre[]> {
    return [...this.byId.values()].filter((c) => c.tenantId === tenantId);
  }

  async save(centre: HealthCentre): Promise<void> {
    this.byId.set(centre.id, centre);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const centre = this.byId.get(id);
    if (centre && centre.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for clinicians. Tenant-scoped (explicit argument + RLS). */
export interface ClinicianRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Clinician | null>;
  findByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<Clinician | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Clinician[]>;
  listByTenant(tenantId: TenantId): Promise<Clinician[]>;
  save(clinician: Clinician): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link ClinicianRepository} — the default for tests and bootstrap. */
export class InMemoryClinicianRepository implements ClinicianRepository {
  private readonly byId = new Map<string, Clinician>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Clinician | null> {
    const clinician = this.byId.get(id);
    return clinician && clinician.tenantId === tenantId ? clinician : null;
  }

  async findByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<Clinician | null> {
    return (
      [...this.byId.values()].find((c) => c.tenantId === tenantId && c.employeeId === employeeId) ??
      null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Clinician[]> {
    return [...this.byId.values()].filter(
      (c) => c.tenantId === tenantId && c.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Clinician[]> {
    return [...this.byId.values()].filter((c) => c.tenantId === tenantId);
  }

  async save(clinician: Clinician): Promise<void> {
    this.byId.set(clinician.id, clinician);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const clinician = this.byId.get(id);
    if (clinician && clinician.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
