import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  FinancialPeriodNotFoundError,
  OrganizationNotFoundForFinanceError,
  PayrollRunNotFoundError,
} from "./errors";
import { payrollRunCancelled, payrollRunPaid, payrollRunProcessed } from "./finance-events";
import {
  cancelPayrollRun,
  type CreatePayrollRunParams,
  createPayrollRun,
  markPayrollRunPaid,
  type PayrollRun,
  processPayrollRun,
} from "./payroll-run";
import type {
  FinancialPeriodRepository,
  OrganizationDirectory,
  PayrollRunRepository,
} from "./ports";

export interface PayrollRunServiceDeps {
  readonly repository: PayrollRunRepository;
  readonly organizations: OrganizationDirectory;
  readonly periods?: FinancialPeriodRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for payroll runs — the compensation batches payslips belong to. Creates a run
 * (validating the organization, and the financial period when one is given), and drives the
 * `draft → processed → paid` lifecycle (with cancel), publishing the run events.
 */
export class PayrollRunService {
  private readonly repository: PayrollRunRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly periods: FinancialPeriodRepository | undefined;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: PayrollRunServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.periods = deps.periods;
    this.events = deps.events;
  }

  async create(input: CreatePayrollRunParams): Promise<PayrollRun> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForFinanceError(input.organizationId);
    }
    if (input.periodId && this.periods) {
      const period = await this.periods.findById(input.tenantId, input.periodId);
      if (!period) {
        throw new FinancialPeriodNotFoundError(input.periodId);
      }
    }
    const run = createPayrollRun(input);
    await this.repository.save(run);
    return run;
  }

  async process(tenantId: TenantId, id: Uuid): Promise<PayrollRun> {
    const updated = processPayrollRun(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(payrollRunProcessed(updated));
    return updated;
  }

  async markPaid(tenantId: TenantId, id: Uuid): Promise<PayrollRun> {
    const updated = markPayrollRunPaid(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(payrollRunPaid(updated));
    return updated;
  }

  async cancel(tenantId: TenantId, id: Uuid): Promise<PayrollRun> {
    const updated = cancelPayrollRun(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(payrollRunCancelled(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<PayrollRun> {
    return this.require(tenantId, id);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<PayrollRun[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  async list(tenantId: TenantId): Promise<PayrollRun[]> {
    return this.repository.listByTenant(tenantId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<PayrollRun> {
    const run = await this.repository.findById(tenantId, id);
    if (!run) {
      throw new PayrollRunNotFoundError(id);
    }
    return run;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
