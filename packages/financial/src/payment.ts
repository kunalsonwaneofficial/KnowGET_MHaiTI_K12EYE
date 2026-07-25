import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  InvalidCurrencyError,
  InvalidPaymentAmountError,
  InvalidPaymentTransitionError,
} from "./errors";
import type { PaymentMethod, PaymentStatus } from "./finance-value";
import { isCurrencyCode, type Money, money } from "./money";

/**
 * A payment — a tender against an {@link Invoice} by a student, in the invoice's currency. It runs
 * `pending → cleared` (the money settles and is applied to the invoice), or `pending → failed`; a
 * `cleared` payment may later be `refunded` (reversed off the invoice). The amount is a positive whole
 * number of minor units. Application to the invoice is coordinated by the service, not the aggregate.
 */
export interface Payment {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly invoiceId: Uuid;
  readonly amountMinor: number;
  readonly currency: string;
  readonly method: PaymentMethod;
  readonly reference: string | null;
  readonly status: PaymentStatus;
  readonly receivedAt: string;
  readonly clearedAt: ISODateString | null;
  readonly refundedAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RecordPaymentParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly invoiceId: Uuid;
  readonly amountMinor: number;
  readonly currency: string;
  readonly method: PaymentMethod;
  readonly receivedAt: string;
  readonly reference?: string | null;
}

/** Record a payment (status `pending`). Amount must be a positive integer; currency valid. */
export function recordPayment(params: RecordPaymentParams): Payment {
  if (!isValidPaymentAmount(params.amountMinor)) {
    throw new InvalidPaymentAmountError(params.amountMinor);
  }
  if (!isCurrencyCode(params.currency)) {
    throw new InvalidCurrencyError(params.currency);
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    studentId: params.studentId,
    invoiceId: params.invoiceId,
    amountMinor: params.amountMinor,
    currency: params.currency,
    method: params.method,
    reference: params.reference?.trim() || null,
    status: "pending",
    receivedAt: params.receivedAt,
    clearedAt: null,
    refundedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

const isValidPaymentAmount = (amountMinor: number): boolean =>
  Number.isInteger(amountMinor) && amountMinor > 0;

const touch = (payment: Payment, patch: Partial<Payment>): Payment => ({
  ...payment,
  ...patch,
  updatedAt: nowIso(),
});

/** Clear a pending payment (→ `cleared`), stamping the clear time. */
export function clearPayment(payment: Payment): Payment {
  if (payment.status !== "pending") {
    throw new InvalidPaymentTransitionError(payment.status, "cleared");
  }
  return touch(payment, { status: "cleared", clearedAt: nowIso() });
}

/** Fail a pending payment (→ `failed`). */
export function failPayment(payment: Payment): Payment {
  if (payment.status !== "pending") {
    throw new InvalidPaymentTransitionError(payment.status, "failed");
  }
  return touch(payment, { status: "failed" });
}

/** Refund a cleared payment (→ `refunded`), stamping the refund time. */
export function refundPayment(payment: Payment): Payment {
  if (payment.status !== "cleared") {
    throw new InvalidPaymentTransitionError(payment.status, "refunded");
  }
  return touch(payment, { status: "refunded", refundedAt: nowIso() });
}

/** The payment amount as {@link Money}. */
export const paymentMoney = (payment: Payment): Money =>
  money(payment.amountMinor, payment.currency);

/** Whether the payment has cleared (settles a charge). */
export const isPaymentCleared = (payment: Payment): boolean => payment.status === "cleared";
