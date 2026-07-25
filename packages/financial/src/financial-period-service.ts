import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicatePeriodCodeError,
  FinancialPeriodNotFoundError,
  OrganizationNotFoundForFinanceError,
} from "./errors";
import { periodClosed, periodOpened, periodReopened } from "./finance-events";
import {
  closeFinancialPeriod,
  type FinancialPeriod,
  type OpenPeriodParams,
  openFinancialPeriod,
  relabelFinancialPeriod,
  reopenFinancialPeriod,
} from "./financial-period";
import type { FinancialPeriodRepository, OrganizationDirectory } from "./ports";

export interface FinancialPeriodServiceDeps {
  readonly repository: FinancialPeriodRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for financial periods — the accounting windows postings belong to. Opens a
 * period (validating the organization and a unique code), relabels it, and drives the `open → closed`
 * lifecycle (with reopen for corrections), publishing the period events.
 */
export class FinancialPeriodService {
  private readonly repository: FinancialPeriodRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: FinancialPeriodServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async open(input: OpenPeriodParams): Promise<FinancialPeriod> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForFinanceError(input.organizationId);
    }
    if (await this.repository.findByCode(input.tenantId, input.code.trim())) {
      throw new DuplicatePeriodCodeError(input.code.trim());
    }
    const period = openFinancialPeriod(input);
    await this.repository.save(period);
    await this.emit(periodOpened(period));
    return period;
  }

  async relabel(tenantId: TenantId, id: Uuid, label: string): Promise<FinancialPeriod> {
    return this.mutate(tenantId, id, (p) => relabelFinancialPeriod(p, label));
  }

  async close(tenantId: TenantId, id: Uuid): Promise<FinancialPeriod> {
    const updated = closeFinancialPeriod(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(periodClosed(updated));
    return updated;
  }

  async reopen(tenantId: TenantId, id: Uuid): Promise<FinancialPeriod> {
    const updated = reopenFinancialPeriod(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(periodReopened(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<FinancialPeriod> {
    return this.require(tenantId, id);
  }

  async getByCode(tenantId: TenantId, code: string): Promise<FinancialPeriod> {
    const period = await this.repository.findByCode(tenantId, code);
    if (!period) {
      throw new FinancialPeriodNotFoundError(code);
    }
    return period;
  }

  async list(tenantId: TenantId): Promise<FinancialPeriod[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<FinancialPeriod[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (period: FinancialPeriod) => FinancialPeriod,
  ): Promise<FinancialPeriod> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<FinancialPeriod> {
    const period = await this.repository.findById(tenantId, id);
    if (!period) {
      throw new FinancialPeriodNotFoundError(id);
    }
    return period;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
