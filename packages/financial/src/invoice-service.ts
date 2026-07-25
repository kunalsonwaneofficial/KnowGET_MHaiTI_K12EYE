import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateInvoiceNumberError,
  InvoiceNotFoundError,
  StudentNotFoundForFinanceError,
} from "./errors";
import { invoiceCancelled, invoiceIssued, invoiceOverdue, invoicePaid } from "./finance-events";
import {
  addInvoiceLine,
  applyPaymentToInvoice,
  cancelInvoice,
  type DraftInvoiceParams,
  draftInvoice,
  type Invoice,
  isInvoiceSettled,
  issueInvoice,
  markInvoiceOverdue,
  removeInvoiceLine,
  reversePaymentFromInvoice,
  setInvoiceNotes,
  updateInvoiceLineAmount,
} from "./invoice";
import type { InvoiceLineInput } from "./invoice-line";
import type { InvoiceRepository, StudentDirectory } from "./ports";

/** The service draft input — the organization is derived from the student, not supplied. */
export type DraftInvoiceInput = Omit<DraftInvoiceParams, "organizationId">;

export interface InvoiceServiceDeps {
  readonly repository: InvoiceRepository;
  readonly students: StudentDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for invoices — the bills students owe. Drafts an invoice against a student
 * (deriving the organization and enforcing a unique number), edits its lines while draft, and drives
 * the `draft → issued → partially_paid | paid | overdue | cancelled` lifecycle, publishing the invoice
 * events. Cleared payments are applied here (by the payment service) so `amountPaidMinor` and status
 * stay in step; a fully-settled invoice publishes the paid event.
 */
export class InvoiceService {
  private readonly repository: InvoiceRepository;
  private readonly students: StudentDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: InvoiceServiceDeps) {
    this.repository = deps.repository;
    this.students = deps.students;
    this.events = deps.events;
  }

  async draft(input: DraftInvoiceInput): Promise<Invoice> {
    const organizationId = await this.students.organizationOf(input.tenantId, input.studentId);
    if (organizationId === null) {
      throw new StudentNotFoundForFinanceError(input.studentId);
    }
    if (await this.repository.findByNumber(input.tenantId, input.number.trim())) {
      throw new DuplicateInvoiceNumberError(input.number.trim());
    }
    const invoice = draftInvoice({ ...input, organizationId });
    await this.repository.save(invoice);
    return invoice;
  }

  async addLine(tenantId: TenantId, id: Uuid, input: InvoiceLineInput): Promise<Invoice> {
    return this.mutate(tenantId, id, (i) => addInvoiceLine(i, input));
  }

  async removeLine(tenantId: TenantId, id: Uuid, key: string): Promise<Invoice> {
    return this.mutate(tenantId, id, (i) => removeInvoiceLine(i, key));
  }

  async updateLineAmount(
    tenantId: TenantId,
    id: Uuid,
    key: string,
    amountMinor: number,
  ): Promise<Invoice> {
    return this.mutate(tenantId, id, (i) => updateInvoiceLineAmount(i, key, amountMinor));
  }

  async setNotes(tenantId: TenantId, id: Uuid, notes: string | null): Promise<Invoice> {
    return this.mutate(tenantId, id, (i) => setInvoiceNotes(i, notes));
  }

  async issue(tenantId: TenantId, id: Uuid): Promise<Invoice> {
    const updated = issueInvoice(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(invoiceIssued(updated));
    return updated;
  }

  async markOverdue(tenantId: TenantId, id: Uuid): Promise<Invoice> {
    const updated = markInvoiceOverdue(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(invoiceOverdue(updated));
    return updated;
  }

  async cancel(tenantId: TenantId, id: Uuid): Promise<Invoice> {
    const updated = cancelInvoice(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(invoiceCancelled(updated));
    return updated;
  }

  /**
   * Apply a cleared payment to an invoice (called by the payment service). Raises the paid amount,
   * recomputes the status, and publishes the paid event when the invoice becomes fully settled.
   */
  async applyClearedPayment(
    tenantId: TenantId,
    invoiceId: Uuid,
    amountMinor: number,
  ): Promise<Invoice> {
    const updated = applyPaymentToInvoice(await this.require(tenantId, invoiceId), amountMinor);
    await this.repository.save(updated);
    if (isInvoiceSettled(updated)) {
      await this.emit(invoicePaid(updated));
    }
    return updated;
  }

  /** Reverse a refunded payment off an invoice (called by the payment service). */
  async reverseClearedPayment(
    tenantId: TenantId,
    invoiceId: Uuid,
    amountMinor: number,
  ): Promise<Invoice> {
    const updated = reversePaymentFromInvoice(await this.require(tenantId, invoiceId), amountMinor);
    await this.repository.save(updated);
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Invoice> {
    return this.require(tenantId, id);
  }

  async getByNumber(tenantId: TenantId, number: string): Promise<Invoice> {
    const invoice = await this.repository.findByNumber(tenantId, number);
    if (!invoice) {
      throw new InvoiceNotFoundError(number);
    }
    return invoice;
  }

  async listForStudent(tenantId: TenantId, studentId: Uuid): Promise<Invoice[]> {
    return this.repository.listByStudent(tenantId, studentId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Invoice[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  async list(tenantId: TenantId): Promise<Invoice[]> {
    return this.repository.listByTenant(tenantId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (invoice: Invoice) => Invoice,
  ): Promise<Invoice> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Invoice> {
    const invoice = await this.repository.findById(tenantId, id);
    if (!invoice) {
      throw new InvoiceNotFoundError(id);
    }
    return invoice;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
