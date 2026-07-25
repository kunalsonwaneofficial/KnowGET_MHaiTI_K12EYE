import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  CurrencyMismatchError,
  DuplicatePayslipError,
  EmployeeCompensationNotFoundError,
  EmployeeNotFoundForFinanceError,
  PayrollRunNotEditableError,
  PayrollRunNotFoundError,
  PayslipNotFoundError,
} from "./errors";
import { payslipApproved, payslipPaid } from "./finance-events";
import type { PayComponentInput } from "./pay-component";
import { isPayrollRunEditable } from "./payroll-run";
import {
  addPayslipDeduction,
  addPayslipEarning,
  approvePayslip,
  draftPayslip,
  markPayslipPaid,
  type Payslip,
  removePayslipDeduction,
  removePayslipEarning,
} from "./payslip";
import type {
  EmployeeCompensationDirectory,
  PayrollRunRepository,
  PayslipRepository,
} from "./ports";

/** The service draft input — organization, currency and base earnings come from the run/employee. */
export interface DraftPayslipInput {
  readonly tenantId: TenantId;
  readonly payrollRunId: Uuid;
  readonly employeeId: Uuid;
  readonly extraEarnings?: readonly PayComponentInput[];
  readonly deductions?: readonly PayComponentInput[];
}

export interface PayslipServiceDeps {
  readonly repository: PayslipRepository;
  readonly runs: PayrollRunRepository;
  readonly employees: EmployeeCompensationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for payslips — an employee's compensation within a payroll run. Drafting a
 * payslip is where the workforce boundary is crossed: the employee's grade/band base earnings are
 * drawn from the compensation directory and become concrete money lines, in the run's currency and
 * organization. Both lists are edited while draft, then the `draft → approved → paid` lifecycle runs,
 * publishing the payslip events. One payslip per employee per run.
 */
export class PayslipService {
  private readonly repository: PayslipRepository;
  private readonly runs: PayrollRunRepository;
  private readonly employees: EmployeeCompensationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: PayslipServiceDeps) {
    this.repository = deps.repository;
    this.runs = deps.runs;
    this.employees = deps.employees;
    this.events = deps.events;
  }

  async draftForEmployee(input: DraftPayslipInput): Promise<Payslip> {
    const run = await this.runs.findById(input.tenantId, input.payrollRunId);
    if (!run) {
      throw new PayrollRunNotFoundError(input.payrollRunId);
    }
    if (!isPayrollRunEditable(run)) {
      throw new PayrollRunNotEditableError(run.id, run.status);
    }
    if ((await this.employees.organizationOf(input.tenantId, input.employeeId)) === null) {
      throw new EmployeeNotFoundForFinanceError(input.employeeId);
    }
    if (await this.repository.findByRunAndEmployee(input.tenantId, run.id, input.employeeId)) {
      throw new DuplicatePayslipError(run.id, input.employeeId);
    }
    const base = await this.employees.baseEarnings(input.tenantId, input.employeeId);
    if (base === null) {
      throw new EmployeeCompensationNotFoundError(input.employeeId);
    }
    if (base.currency !== run.currency) {
      throw new CurrencyMismatchError(run.currency, base.currency);
    }
    const payslip = draftPayslip({
      tenantId: input.tenantId,
      organizationId: run.organizationId,
      payrollRunId: run.id,
      employeeId: input.employeeId,
      currency: run.currency,
      earnings: [...base.components, ...(input.extraEarnings ?? [])],
      deductions: input.deductions ?? [],
    });
    await this.repository.save(payslip);
    return payslip;
  }

  async addEarning(tenantId: TenantId, id: Uuid, input: PayComponentInput): Promise<Payslip> {
    return this.mutate(tenantId, id, (p) => addPayslipEarning(p, input));
  }

  async removeEarning(tenantId: TenantId, id: Uuid, key: string): Promise<Payslip> {
    return this.mutate(tenantId, id, (p) => removePayslipEarning(p, key));
  }

  async addDeduction(tenantId: TenantId, id: Uuid, input: PayComponentInput): Promise<Payslip> {
    return this.mutate(tenantId, id, (p) => addPayslipDeduction(p, input));
  }

  async removeDeduction(tenantId: TenantId, id: Uuid, key: string): Promise<Payslip> {
    return this.mutate(tenantId, id, (p) => removePayslipDeduction(p, key));
  }

  async approve(tenantId: TenantId, id: Uuid): Promise<Payslip> {
    const updated = approvePayslip(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(payslipApproved(updated));
    return updated;
  }

  async markPaid(tenantId: TenantId, id: Uuid): Promise<Payslip> {
    const updated = markPayslipPaid(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(payslipPaid(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Payslip> {
    return this.require(tenantId, id);
  }

  async listForRun(tenantId: TenantId, payrollRunId: Uuid): Promise<Payslip[]> {
    return this.repository.listByRun(tenantId, payrollRunId);
  }

  async listForEmployee(tenantId: TenantId, employeeId: Uuid): Promise<Payslip[]> {
    return this.repository.listByEmployee(tenantId, employeeId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (payslip: Payslip) => Payslip,
  ): Promise<Payslip> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Payslip> {
    const payslip = await this.repository.findById(tenantId, id);
    if (!payslip) {
      throw new PayslipNotFoundError(id);
    }
    return payslip;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
