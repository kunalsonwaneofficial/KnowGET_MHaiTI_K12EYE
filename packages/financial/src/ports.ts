import type { TenantId, Uuid } from "@knowget/types";
import type { Concession } from "./concession";
import type { FeeStructure } from "./fee-structure";
import type { FinancialPeriod } from "./financial-period";
import type { Invoice } from "./invoice";
import type { PayComponentInput } from "./pay-component";
import type { Payment } from "./payment";
import type { PayrollRun } from "./payroll-run";
import type { Payslip } from "./payslip";

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

/** The base earnings drawn from an employee's compensation band (P2-D12 grade/band). */
export interface EmployeeEarnings {
  readonly currency: string;
  readonly components: readonly PayComponentInput[];
}

/**
 * Read model over the workforce domain (P2-D12): a staff member paid here is an Employee. `exists`
 * answers presence; `organizationOf` resolves the employee's organization; `baseEarnings` turns the
 * employee's grade/band into the concrete earning lines a payslip is seeded from (or `null` if the
 * employee, or their band, is unknown). The finance domain links to workforce and never depends on
 * `@knowget/workforce` directly.
 */
export interface EmployeeCompensationDirectory {
  exists(tenantId: TenantId, employeeId: Uuid): Promise<boolean>;
  organizationOf(tenantId: TenantId, employeeId: Uuid): Promise<Uuid | null>;
  baseEarnings(tenantId: TenantId, employeeId: Uuid): Promise<EmployeeEarnings | null>;
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

/** Storage contract for concessions. Tenant-scoped (explicit argument + RLS). */
export interface ConcessionRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Concession | null>;
  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<Concession[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Concession[]>;
  listByTenant(tenantId: TenantId): Promise<Concession[]>;
  save(concession: Concession): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link ConcessionRepository} — the default for tests and bootstrap. */
export class InMemoryConcessionRepository implements ConcessionRepository {
  private readonly byId = new Map<string, Concession>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Concession | null> {
    const concession = this.byId.get(id);
    return concession && concession.tenantId === tenantId ? concession : null;
  }

  async listByStudent(tenantId: TenantId, studentId: Uuid): Promise<Concession[]> {
    return [...this.byId.values()].filter(
      (c) => c.tenantId === tenantId && c.studentId === studentId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Concession[]> {
    return [...this.byId.values()].filter(
      (c) => c.tenantId === tenantId && c.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Concession[]> {
    return [...this.byId.values()].filter((c) => c.tenantId === tenantId);
  }

  async save(concession: Concession): Promise<void> {
    this.byId.set(concession.id, concession);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const concession = this.byId.get(id);
    if (concession && concession.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for payroll runs. Tenant-scoped (explicit argument + RLS). */
export interface PayrollRunRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<PayrollRun | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<PayrollRun[]>;
  listByTenant(tenantId: TenantId): Promise<PayrollRun[]>;
  save(run: PayrollRun): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link PayrollRunRepository} — the default for tests and bootstrap. */
export class InMemoryPayrollRunRepository implements PayrollRunRepository {
  private readonly byId = new Map<string, PayrollRun>();

  async findById(tenantId: TenantId, id: Uuid): Promise<PayrollRun | null> {
    const run = this.byId.get(id);
    return run && run.tenantId === tenantId ? run : null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<PayrollRun[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<PayrollRun[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  async save(run: PayrollRun): Promise<void> {
    this.byId.set(run.id, run);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const run = this.byId.get(id);
    if (run && run.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for payslips. Tenant-scoped (explicit argument + RLS). */
export interface PayslipRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Payslip | null>;
  findByRunAndEmployee(
    tenantId: TenantId,
    payrollRunId: Uuid,
    employeeId: Uuid,
  ): Promise<Payslip | null>;
  listByRun(tenantId: TenantId, payrollRunId: Uuid): Promise<Payslip[]>;
  listByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<Payslip[]>;
  listByTenant(tenantId: TenantId): Promise<Payslip[]>;
  save(payslip: Payslip): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link PayslipRepository} — the default for tests and bootstrap. */
export class InMemoryPayslipRepository implements PayslipRepository {
  private readonly byId = new Map<string, Payslip>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Payslip | null> {
    const payslip = this.byId.get(id);
    return payslip && payslip.tenantId === tenantId ? payslip : null;
  }

  async findByRunAndEmployee(
    tenantId: TenantId,
    payrollRunId: Uuid,
    employeeId: Uuid,
  ): Promise<Payslip | null> {
    return (
      [...this.byId.values()].find(
        (p) =>
          p.tenantId === tenantId && p.payrollRunId === payrollRunId && p.employeeId === employeeId,
      ) ?? null
    );
  }

  async listByRun(tenantId: TenantId, payrollRunId: Uuid): Promise<Payslip[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.payrollRunId === payrollRunId,
    );
  }

  async listByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<Payslip[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.employeeId === employeeId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Payslip[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(payslip: Payslip): Promise<void> {
    this.byId.set(payslip.id, payslip);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const payslip = this.byId.get(id);
    if (payslip && payslip.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
