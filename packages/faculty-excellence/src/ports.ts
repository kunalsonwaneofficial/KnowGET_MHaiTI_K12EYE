import type { TenantId, Uuid } from "@knowget/types";
import type { CompetencyFramework } from "./competency-framework";
import type { Observation } from "./observation";

/**
 * Read model over the organization domain (P2-D01-M01): does this organization node exist in the
 * tenant? Frameworks attach to it.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/**
 * Read model over the workforce domain (P2-D12): does this employee exist in the tenant? A staff
 * member observed, coached or developed here is an Employee; the faculty domain links to it and
 * never depends on `@knowget/workforce` directly.
 */
export interface EmployeeDirectory {
  exists(tenantId: TenantId, employeeId: Uuid): Promise<boolean>;
}

/** Storage contract for competency frameworks. Tenant-scoped (explicit argument + RLS). */
export interface CompetencyFrameworkRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<CompetencyFramework | null>;
  findByCode(tenantId: TenantId, code: string): Promise<CompetencyFramework | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<CompetencyFramework[]>;
  listByTenant(tenantId: TenantId): Promise<CompetencyFramework[]>;
  save(framework: CompetencyFramework): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link CompetencyFrameworkRepository} — the default for tests and bootstrap. */
export class InMemoryCompetencyFrameworkRepository implements CompetencyFrameworkRepository {
  private readonly byId = new Map<string, CompetencyFramework>();

  async findById(tenantId: TenantId, id: Uuid): Promise<CompetencyFramework | null> {
    const framework = this.byId.get(id);
    return framework && framework.tenantId === tenantId ? framework : null;
  }

  async findByCode(tenantId: TenantId, code: string): Promise<CompetencyFramework | null> {
    return [...this.byId.values()].find((f) => f.tenantId === tenantId && f.code === code) ?? null;
  }

  async listByOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<CompetencyFramework[]> {
    return [...this.byId.values()].filter(
      (f) => f.tenantId === tenantId && f.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<CompetencyFramework[]> {
    return [...this.byId.values()].filter((f) => f.tenantId === tenantId);
  }

  async save(framework: CompetencyFramework): Promise<void> {
    this.byId.set(framework.id, framework);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const framework = this.byId.get(id);
    if (framework && framework.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for observations. Tenant-scoped (explicit argument + RLS). */
export interface ObservationRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Observation | null>;
  listByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<Observation[]>;
  listByObserver(tenantId: TenantId, observerId: Uuid): Promise<Observation[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Observation[]>;
  listByTenant(tenantId: TenantId): Promise<Observation[]>;
  save(observation: Observation): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link ObservationRepository} — the default for tests and bootstrap. */
export class InMemoryObservationRepository implements ObservationRepository {
  private readonly byId = new Map<string, Observation>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Observation | null> {
    const observation = this.byId.get(id);
    return observation && observation.tenantId === tenantId ? observation : null;
  }

  async listByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<Observation[]> {
    return [...this.byId.values()].filter(
      (o) => o.tenantId === tenantId && o.employeeId === employeeId,
    );
  }

  async listByObserver(tenantId: TenantId, observerId: Uuid): Promise<Observation[]> {
    return [...this.byId.values()].filter(
      (o) => o.tenantId === tenantId && o.observerId === observerId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Observation[]> {
    return [...this.byId.values()].filter(
      (o) => o.tenantId === tenantId && o.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Observation[]> {
    return [...this.byId.values()].filter((o) => o.tenantId === tenantId);
  }

  async save(observation: Observation): Promise<void> {
    this.byId.set(observation.id, observation);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const observation = this.byId.get(id);
    if (observation && observation.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
