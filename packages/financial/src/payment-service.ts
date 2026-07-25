import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { PaymentNotFoundError } from "./errors";
import type { PaymentMethod } from "./finance-value";
import { paymentCleared, paymentFailed, paymentRecorded, paymentRefunded } from "./finance-events";
import type { InvoiceService } from "./invoice-service";
import { clearPayment, failPayment, type Payment, recordPayment, refundPayment } from "./payment";
import type { PaymentRepository } from "./ports";

/** The service record input — organization, student and currency are taken from the invoice. */
export interface RecordPaymentInput {
  readonly tenantId: TenantId;
  readonly invoiceId: Uuid;
  readonly amountMinor: number;
  readonly method: PaymentMethod;
  readonly receivedAt: string;
  readonly reference?: string | null;
}

export interface PaymentServiceDeps {
  readonly repository: PaymentRepository;
  readonly invoices: InvoiceService;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for payments — tenders against invoices. Records a payment (inheriting the
 * invoice's organization, student and currency so the two can never disagree), and drives the
 * `pending → cleared | failed` lifecycle with `cleared → refunded`. Clearing a payment applies it to
 * its invoice; refunding reverses it — both go through the invoice service, so a payment never
 * settles a charge the invoice has not accepted.
 */
export class PaymentService {
  private readonly repository: PaymentRepository;
  private readonly invoices: InvoiceService;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: PaymentServiceDeps) {
    this.repository = deps.repository;
    this.invoices = deps.invoices;
    this.events = deps.events;
  }

  async record(input: RecordPaymentInput): Promise<Payment> {
    const invoice = await this.invoices.getById(input.tenantId, input.invoiceId);
    const payment = recordPayment({
      tenantId: input.tenantId,
      organizationId: invoice.organizationId,
      studentId: invoice.studentId,
      invoiceId: invoice.id,
      amountMinor: input.amountMinor,
      currency: invoice.currency,
      method: input.method,
      receivedAt: input.receivedAt,
      reference: input.reference ?? null,
    });
    await this.repository.save(payment);
    await this.emit(paymentRecorded(payment));
    return payment;
  }

  async clear(tenantId: TenantId, id: Uuid): Promise<Payment> {
    const cleared = clearPayment(await this.require(tenantId, id));
    // Apply to the invoice first: if the invoice rejects it (overpayment, not payable),
    // the payment is left untouched rather than marked cleared.
    await this.invoices.applyClearedPayment(tenantId, cleared.invoiceId, cleared.amountMinor);
    await this.repository.save(cleared);
    await this.emit(paymentCleared(cleared));
    return cleared;
  }

  async fail(tenantId: TenantId, id: Uuid): Promise<Payment> {
    const failed = failPayment(await this.require(tenantId, id));
    await this.repository.save(failed);
    await this.emit(paymentFailed(failed));
    return failed;
  }

  async refund(tenantId: TenantId, id: Uuid): Promise<Payment> {
    const refunded = refundPayment(await this.require(tenantId, id));
    await this.invoices.reverseClearedPayment(tenantId, refunded.invoiceId, refunded.amountMinor);
    await this.repository.save(refunded);
    await this.emit(paymentRefunded(refunded));
    return refunded;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Payment> {
    return this.require(tenantId, id);
  }

  async listForInvoice(tenantId: TenantId, invoiceId: Uuid): Promise<Payment[]> {
    return this.repository.listByInvoice(tenantId, invoiceId);
  }

  async listForStudent(tenantId: TenantId, studentId: Uuid): Promise<Payment[]> {
    return this.repository.listByStudent(tenantId, studentId);
  }

  async list(tenantId: TenantId): Promise<Payment[]> {
    return this.repository.listByTenant(tenantId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Payment> {
    const payment = await this.repository.findById(tenantId, id);
    if (!payment) {
      throw new PaymentNotFoundError(id);
    }
    return payment;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
