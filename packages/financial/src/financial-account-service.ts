import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { computeAccountStatement, summarizeReceivables } from "./account-statement";
import {
  NoFinancialActivityError,
  StudentFinancialAccountNotFoundError,
  StudentNotFoundForFinanceError,
} from "./errors";
import { financialAccountRefreshed } from "./finance-events";
import type { ChargeView, CreditView, ReceivablesSummary } from "./finance-view";
import { invoiceTotalMinor } from "./invoice";
import type {
  InvoiceRepository,
  PaymentRepository,
  StudentDirectory,
  StudentFinancialAccountRepository,
} from "./ports";
import {
  accountMemberView,
  createStudentFinancialAccount,
  refreshStudentFinancialAccount,
  type StudentFinancialAccount,
} from "./student-financial-account";

export interface FinancialAccountServiceDeps {
  readonly repository: StudentFinancialAccountRepository;
  readonly invoices: InvoiceRepository;
  readonly payments: PaymentRepository;
  readonly students: StudentDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for student financial accounts — the descriptive receivables read model.
 * `refresh` reconciles a student's live invoices (as charges) against their payments (as credits)
 * through the pure account-statement engine and upserts the account (creating it on first sight,
 * refreshing and version-bumping thereafter). `receivablesFor` rolls the accounts of an organization
 * up into a leadership summary. The account is never a transaction; it is always derived.
 */
export class FinancialAccountService {
  private readonly repository: StudentFinancialAccountRepository;
  private readonly invoices: InvoiceRepository;
  private readonly payments: PaymentRepository;
  private readonly students: StudentDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: FinancialAccountServiceDeps) {
    this.repository = deps.repository;
    this.invoices = deps.invoices;
    this.payments = deps.payments;
    this.students = deps.students;
    this.events = deps.events;
  }

  async refresh(tenantId: TenantId, studentId: Uuid): Promise<StudentFinancialAccount> {
    const organizationId = await this.students.organizationOf(tenantId, studentId);
    if (organizationId === null) {
      throw new StudentNotFoundForFinanceError(studentId);
    }
    const invoices = await this.invoices.listByStudent(tenantId, studentId);
    const payments = await this.payments.listByStudent(tenantId, studentId);
    const existing = await this.repository.findByStudent(tenantId, studentId);
    const currency = invoices[0]?.currency ?? existing?.currency ?? null;
    if (currency === null) {
      throw new NoFinancialActivityError(studentId);
    }
    const charges: ChargeView[] = invoices.map((invoice) => ({
      amountMinor: invoiceTotalMinor(invoice),
      currency: invoice.currency,
      status: invoice.status,
    }));
    const credits: CreditView[] = payments.map((payment) => ({
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      status: payment.status,
    }));
    const statement = computeAccountStatement(currency, charges, credits);
    const account = existing
      ? refreshStudentFinancialAccount(existing, statement)
      : createStudentFinancialAccount({ tenantId, organizationId, studentId, statement });
    await this.repository.save(account);
    await this.emit(financialAccountRefreshed(account));
    return account;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<StudentFinancialAccount> {
    const account = await this.repository.findById(tenantId, id);
    if (!account) {
      throw new StudentFinancialAccountNotFoundError(id);
    }
    return account;
  }

  async getForStudent(tenantId: TenantId, studentId: Uuid): Promise<StudentFinancialAccount> {
    const account = await this.repository.findByStudent(tenantId, studentId);
    if (!account) {
      throw new StudentFinancialAccountNotFoundError(studentId);
    }
    return account;
  }

  async listForOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<StudentFinancialAccount[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  /** Roll an organization's accounts (in a given currency) into a receivables summary. */
  async receivablesFor(
    tenantId: TenantId,
    organizationId: Uuid,
    currency: string,
  ): Promise<ReceivablesSummary> {
    const accounts = (await this.repository.listByOrganization(tenantId, organizationId)).filter(
      (account) => account.currency === currency,
    );
    return summarizeReceivables(currency, accounts.map(accountMemberView));
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
