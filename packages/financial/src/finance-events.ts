import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import { type FeeStructure, feeStructureTotal } from "./fee-structure";
import type { FinancialPeriod } from "./financial-period";
import { type Invoice, invoiceTotalMinor } from "./invoice";
import type { Payment } from "./payment";

// --- Financial period ------------------------------------------------------------
export const PERIOD_OPENED = "finance.period.opened";
export const PERIOD_CLOSED = "finance.period.closed";
export const PERIOD_REOPENED = "finance.period.reopened";

export interface PeriodEventPayload {
  readonly periodId: Uuid;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly status: string;
}

export type PeriodOpenedEvent = DomainEvent<typeof PERIOD_OPENED, PeriodEventPayload>;
export type PeriodClosedEvent = DomainEvent<typeof PERIOD_CLOSED, PeriodEventPayload>;
export type PeriodReopenedEvent = DomainEvent<typeof PERIOD_REOPENED, PeriodEventPayload>;

const periodPayload = (period: FinancialPeriod): PeriodEventPayload => ({
  periodId: period.id,
  organizationId: period.organizationId,
  code: period.code,
  status: period.status,
});

export const periodOpened = (period: FinancialPeriod): PeriodOpenedEvent =>
  createEvent(PERIOD_OPENED, periodPayload(period), { tenantId: period.tenantId });

export const periodClosed = (period: FinancialPeriod): PeriodClosedEvent =>
  createEvent(PERIOD_CLOSED, periodPayload(period), { tenantId: period.tenantId });

export const periodReopened = (period: FinancialPeriod): PeriodReopenedEvent =>
  createEvent(PERIOD_REOPENED, periodPayload(period), { tenantId: period.tenantId });

// --- Fee structure ---------------------------------------------------------------
export const FEE_STRUCTURE_CREATED = "finance.fee_structure.created";
export const FEE_STRUCTURE_ACTIVATED = "finance.fee_structure.activated";
export const FEE_STRUCTURE_ARCHIVED = "finance.fee_structure.archived";

export interface FeeStructureEventPayload {
  readonly feeStructureId: Uuid;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly componentCount: number;
  readonly totalMinor: number;
  readonly currency: string;
  readonly status: string;
}

export type FeeStructureCreatedEvent = DomainEvent<
  typeof FEE_STRUCTURE_CREATED,
  FeeStructureEventPayload
>;
export type FeeStructureActivatedEvent = DomainEvent<
  typeof FEE_STRUCTURE_ACTIVATED,
  FeeStructureEventPayload
>;
export type FeeStructureArchivedEvent = DomainEvent<
  typeof FEE_STRUCTURE_ARCHIVED,
  FeeStructureEventPayload
>;

const feeStructurePayload = (structure: FeeStructure): FeeStructureEventPayload => ({
  feeStructureId: structure.id,
  organizationId: structure.organizationId,
  code: structure.code,
  componentCount: structure.components.length,
  totalMinor: feeStructureTotal(structure).amountMinor,
  currency: structure.currency,
  status: structure.status,
});

export const feeStructureCreated = (structure: FeeStructure): FeeStructureCreatedEvent =>
  createEvent(FEE_STRUCTURE_CREATED, feeStructurePayload(structure), {
    tenantId: structure.tenantId,
  });

export const feeStructureActivated = (structure: FeeStructure): FeeStructureActivatedEvent =>
  createEvent(FEE_STRUCTURE_ACTIVATED, feeStructurePayload(structure), {
    tenantId: structure.tenantId,
  });

export const feeStructureArchived = (structure: FeeStructure): FeeStructureArchivedEvent =>
  createEvent(FEE_STRUCTURE_ARCHIVED, feeStructurePayload(structure), {
    tenantId: structure.tenantId,
  });

// --- Invoice ---------------------------------------------------------------------
export const INVOICE_ISSUED = "finance.invoice.issued";
export const INVOICE_PAID = "finance.invoice.paid";
export const INVOICE_OVERDUE = "finance.invoice.overdue";
export const INVOICE_CANCELLED = "finance.invoice.cancelled";

export interface InvoiceEventPayload {
  readonly invoiceId: Uuid;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly number: string;
  readonly totalMinor: number;
  readonly amountPaidMinor: number;
  readonly currency: string;
  readonly status: string;
}

export type InvoiceIssuedEvent = DomainEvent<typeof INVOICE_ISSUED, InvoiceEventPayload>;
export type InvoicePaidEvent = DomainEvent<typeof INVOICE_PAID, InvoiceEventPayload>;
export type InvoiceOverdueEvent = DomainEvent<typeof INVOICE_OVERDUE, InvoiceEventPayload>;
export type InvoiceCancelledEvent = DomainEvent<typeof INVOICE_CANCELLED, InvoiceEventPayload>;

const invoicePayload = (invoice: Invoice): InvoiceEventPayload => ({
  invoiceId: invoice.id,
  organizationId: invoice.organizationId,
  studentId: invoice.studentId,
  number: invoice.number,
  totalMinor: invoiceTotalMinor(invoice),
  amountPaidMinor: invoice.amountPaidMinor,
  currency: invoice.currency,
  status: invoice.status,
});

export const invoiceIssued = (invoice: Invoice): InvoiceIssuedEvent =>
  createEvent(INVOICE_ISSUED, invoicePayload(invoice), { tenantId: invoice.tenantId });

export const invoicePaid = (invoice: Invoice): InvoicePaidEvent =>
  createEvent(INVOICE_PAID, invoicePayload(invoice), { tenantId: invoice.tenantId });

export const invoiceOverdue = (invoice: Invoice): InvoiceOverdueEvent =>
  createEvent(INVOICE_OVERDUE, invoicePayload(invoice), { tenantId: invoice.tenantId });

export const invoiceCancelled = (invoice: Invoice): InvoiceCancelledEvent =>
  createEvent(INVOICE_CANCELLED, invoicePayload(invoice), { tenantId: invoice.tenantId });

// --- Payment ---------------------------------------------------------------------
export const PAYMENT_RECORDED = "finance.payment.recorded";
export const PAYMENT_CLEARED = "finance.payment.cleared";
export const PAYMENT_FAILED = "finance.payment.failed";
export const PAYMENT_REFUNDED = "finance.payment.refunded";

export interface PaymentEventPayload {
  readonly paymentId: Uuid;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly invoiceId: Uuid;
  readonly amountMinor: number;
  readonly currency: string;
  readonly status: string;
}

export type PaymentRecordedEvent = DomainEvent<typeof PAYMENT_RECORDED, PaymentEventPayload>;
export type PaymentClearedEvent = DomainEvent<typeof PAYMENT_CLEARED, PaymentEventPayload>;
export type PaymentFailedEvent = DomainEvent<typeof PAYMENT_FAILED, PaymentEventPayload>;
export type PaymentRefundedEvent = DomainEvent<typeof PAYMENT_REFUNDED, PaymentEventPayload>;

const paymentPayload = (payment: Payment): PaymentEventPayload => ({
  paymentId: payment.id,
  organizationId: payment.organizationId,
  studentId: payment.studentId,
  invoiceId: payment.invoiceId,
  amountMinor: payment.amountMinor,
  currency: payment.currency,
  status: payment.status,
});

export const paymentRecorded = (payment: Payment): PaymentRecordedEvent =>
  createEvent(PAYMENT_RECORDED, paymentPayload(payment), { tenantId: payment.tenantId });

export const paymentCleared = (payment: Payment): PaymentClearedEvent =>
  createEvent(PAYMENT_CLEARED, paymentPayload(payment), { tenantId: payment.tenantId });

export const paymentFailed = (payment: Payment): PaymentFailedEvent =>
  createEvent(PAYMENT_FAILED, paymentPayload(payment), { tenantId: payment.tenantId });

export const paymentRefunded = (payment: Payment): PaymentRefundedEvent =>
  createEvent(PAYMENT_REFUNDED, paymentPayload(payment), { tenantId: payment.tenantId });
