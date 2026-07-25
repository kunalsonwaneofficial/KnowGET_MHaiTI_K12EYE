import type { TenantId, Uuid } from "@knowget/types";
import type { FeeStructure } from "./fee-structure";
import type { FinancialPeriod } from "./financial-period";
import type { Invoice } from "./invoice";
import type { Payment } from "./payment";

/**
 * Read model over the organization domain (P2-D01-M01): does this organization node exist in the
 * tenant? Financial periods and fee structures attach to it; the finance domain links to it and never
 * depends on `@knowget/organization` directly.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/**
 * Read model over the student-lifecycle domain (P2-D03): a learner billed here is a Student; the
 * finance domain links to it and never depends on `@knowget/student-lifecycle` directly. `exists`
 * answers presence; `organizationOf` resolves the student's organization (or `null` if unknown) so an
 * invoice derives its organization from the student it bills.
 */
export interface StudentDirectory {
  exists(tenantId: TenantId, studentId: Uuid): Promise<boolean>;
  organizationOf(tenantId: TenantId, studentId: Uuid): Promise<Uuid | null>;
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

/** Storage contract for invoices. Tenant-scoped (explicit argument + RLS). */
export interface InvoiceRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Invoice | null>;
  findByNumber(tenantId: TenantId, number: string): Promise<Invoice | null>;
  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<Invoice[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Invoice[]>;
  listByTenant(tenantId: TenantId): Promise<Invoice[]>;
  save(invoice: Invoice): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link InvoiceRepository} — the default for tests and bootstrap. */
export class InMemoryInvoiceRepository implements InvoiceRepository {
  private readonly byId = new Map<string, Invoice>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Invoice | null> {
    const invoice = this.byId.get(id);
    return invoice && invoice.tenantId === tenantId ? invoice : null;
  }

  async findByNumber(tenantId: TenantId, number: string): Promise<Invoice | null> {
    return (
      [...this.byId.values()].find((i) => i.tenantId === tenantId && i.number === number) ?? null
    );
  }

  async listByStudent(tenantId: TenantId, studentId: Uuid): Promise<Invoice[]> {
    return [...this.byId.values()].filter(
      (i) => i.tenantId === tenantId && i.studentId === studentId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Invoice[]> {
    return [...this.byId.values()].filter(
      (i) => i.tenantId === tenantId && i.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Invoice[]> {
    return [...this.byId.values()].filter((i) => i.tenantId === tenantId);
  }

  async save(invoice: Invoice): Promise<void> {
    this.byId.set(invoice.id, invoice);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const invoice = this.byId.get(id);
    if (invoice && invoice.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for payments. Tenant-scoped (explicit argument + RLS). */
export interface PaymentRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Payment | null>;
  listByInvoice(tenantId: TenantId, invoiceId: Uuid): Promise<Payment[]>;
  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<Payment[]>;
  listByTenant(tenantId: TenantId): Promise<Payment[]>;
  save(payment: Payment): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link PaymentRepository} — the default for tests and bootstrap. */
export class InMemoryPaymentRepository implements PaymentRepository {
  private readonly byId = new Map<string, Payment>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Payment | null> {
    const payment = this.byId.get(id);
    return payment && payment.tenantId === tenantId ? payment : null;
  }

  async listByInvoice(tenantId: TenantId, invoiceId: Uuid): Promise<Payment[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.invoiceId === invoiceId,
    );
  }

  async listByStudent(tenantId: TenantId, studentId: Uuid): Promise<Payment[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.studentId === studentId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Payment[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(payment: Payment): Promise<void> {
    this.byId.set(payment.id, payment);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const payment = this.byId.get(id);
    if (payment && payment.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
