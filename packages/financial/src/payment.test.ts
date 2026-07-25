import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { InvalidPaymentAmountError, InvalidPaymentTransitionError } from "./errors";
import {
  clearPayment,
  failPayment,
  isPaymentCleared,
  paymentMoney,
  recordPayment,
  refundPayment,
} from "./payment";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const STUDENT = "33333333-3333-3333-3333-333333333333" as Uuid;
const INVOICE = "44444444-4444-4444-4444-444444444444" as Uuid;

const record = () =>
  recordPayment({
    tenantId: TENANT,
    organizationId: ORG,
    studentId: STUDENT,
    invoiceId: INVOICE,
    amountMinor: 200000,
    currency: "INR",
    method: "cash",
    receivedAt: "2025-05-01",
  });

describe("payment", () => {
  it("records a pending payment and requires a positive integer amount", () => {
    const payment = record();
    expect(payment.status).toBe("pending");
    expect(payment.clearedAt).toBeNull();
    expect(paymentMoney(payment)).toEqual({ amountMinor: 200000, currency: "INR" });
    expect(() => recordPayment({ ...paramsWith(0) })).toThrow(InvalidPaymentAmountError);
    expect(() => recordPayment({ ...paramsWith(-5) })).toThrow(InvalidPaymentAmountError);
    expect(() => recordPayment({ ...paramsWith(1.5) })).toThrow(InvalidPaymentAmountError);
  });

  it("clears, fails and refunds along the permitted transitions only", () => {
    const cleared = clearPayment(record());
    expect(cleared.status).toBe("cleared");
    expect(cleared.clearedAt).not.toBeNull();
    expect(isPaymentCleared(cleared)).toBe(true);

    const refunded = refundPayment(cleared);
    expect(refunded.status).toBe("refunded");
    expect(refunded.refundedAt).not.toBeNull();

    expect(() => clearPayment(refunded)).toThrow(InvalidPaymentTransitionError);
    expect(() => refundPayment(record())).toThrow(InvalidPaymentTransitionError);
    expect(failPayment(record()).status).toBe("failed");
    expect(() => failPayment(clearPayment(record()))).toThrow(InvalidPaymentTransitionError);
  });
});

const paramsWith = (amountMinor: number) =>
  ({
    tenantId: TENANT,
    organizationId: ORG,
    studentId: STUDENT,
    invoiceId: INVOICE,
    amountMinor,
    currency: "INR",
    method: "cash",
    receivedAt: "2025-05-01",
  }) as const;
