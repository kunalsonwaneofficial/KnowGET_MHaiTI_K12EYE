import type { TenantId, Uuid } from "@knowget/types";
import type { FeeStructure } from "./fee-structure";
import type { FinancialPeriod } from "./financial-period";

/**
 * Read model over the organization domain (P2-D01-M01): does this organization node exist in the
 * tenant? Financial periods and fee structures attach to it; the finance domain links to it and never
 * depends on `@knowget/organization` directly.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/** Storage contract for financial periods. Tenant-scoped (explicit argument + RLS). */
export interface FinancialPeriodRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<FinancialPeriod | null>;
  findByCode(tenantId: TenantId, code: string): Promise<FinancialPeriod | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<FinancialPeriod[]>;
  listByTenant(tenantId: TenantId): Promise<FinancialPeriod[]>;
  save(period: FinancialPeriod): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link FinancialPeriodRepository} — the default for tests and bootstrap. */
export class InMemoryFinancialPeriodRepository implements FinancialPeriodRepository {
  private readonly byId = new Map<string, FinancialPeriod>();

  async findById(tenantId: TenantId, id: Uuid): Promise<FinancialPeriod | null> {
    const period = this.byId.get(id);
    return period && period.tenantId === tenantId ? period : null;
  }

  async findByCode(tenantId: TenantId, code: string): Promise<FinancialPeriod | null> {
    return [...this.byId.values()].find((p) => p.tenantId === tenantId && p.code === code) ?? null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<FinancialPeriod[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<FinancialPeriod[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(period: FinancialPeriod): Promise<void> {
    this.byId.set(period.id, period);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const period = this.byId.get(id);
    if (period && period.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for fee structures. Tenant-scoped (explicit argument + RLS). */
export interface FeeStructureRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<FeeStructure | null>;
  findByCode(tenantId: TenantId, code: string): Promise<FeeStructure | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<FeeStructure[]>;
  listByTenant(tenantId: TenantId): Promise<FeeStructure[]>;
  save(structure: FeeStructure): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link FeeStructureRepository} — the default for tests and bootstrap. */
export class InMemoryFeeStructureRepository implements FeeStructureRepository {
  private readonly byId = new Map<string, FeeStructure>();

  async findById(tenantId: TenantId, id: Uuid): Promise<FeeStructure | null> {
    const structure = this.byId.get(id);
    return structure && structure.tenantId === tenantId ? structure : null;
  }

  async findByCode(tenantId: TenantId, code: string): Promise<FeeStructure | null> {
    return [...this.byId.values()].find((s) => s.tenantId === tenantId && s.code === code) ?? null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<FeeStructure[]> {
    return [...this.byId.values()].filter(
      (s) => s.tenantId === tenantId && s.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<FeeStructure[]> {
    return [...this.byId.values()].filter((s) => s.tenantId === tenantId);
  }

  async save(structure: FeeStructure): Promise<void> {
    this.byId.set(structure.id, structure);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const structure = this.byId.get(id);
    if (structure && structure.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
