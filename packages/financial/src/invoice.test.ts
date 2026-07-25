import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  DuplicateInvoiceLineKeyError,
  EmptyInvoiceError,
  InvalidInvoiceTransitionError,
  InvoiceHasPaymentsError,
  InvoiceLineNotFoundError,
  InvoiceNotEditableError,
  InvoiceNotPayableError,
  PaymentExceedsOutstandingError,
  ReversalExceedsPaidError,
} from "./errors";
import {
  addInvoiceLine,
  applyPaymentToInvoice,
  cancelInvoice,
  draftInvoice,
  invoiceOutstandingMinor,
  invoiceTotal,
  invoiceTotalMinor,
  isInvoiceSettled,
  issueInvoice,
  markInvoiceOverdue,
  removeInvoiceLine,
  reversePaymentFromInvoice,
  updateInvoiceLineAmount,
} from "./invoice";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const STUDENT = "33333333-3333-3333-3333-333333333333" as Uuid;

const params = {
  tenantId: TENANT,
  organizationId: ORG,
  studentId: STUDENT,
  number: "INV-001",
  currency: "INR",
  dueDate: "2025-05-15",
  lines: [
    { key: "tuition", description: "Tuition", amountMinor: 500000 },
    { key: "transport", description: "Transport", amountMinor: 100000 },
  ],
} as const;

const draft = () => draftInvoice(params);
const issued = () => issueInvoice(draft());

describe("invoice", () => {
  it("drafts, totals its lines, and issues (freezing them)", () => {
    const inv = draft();
    expect(inv.status).toBe("draft");
    expect(inv.amountPaidMinor).toBe(0);
    expect(invoiceTotal(inv)).toEqual({ amountMinor: 600000, currency: "INR" });

    const iss = issueInvoice(inv);
    expect(iss.status).toBe("issued");
    expect(iss.issuedAt).not.toBeNull();
    expect(() => addInvoiceLine(iss, { key: "x", description: "X", amountMinor: 1 })).toThrow(
      InvoiceNotEditableError,
    );
  });

  it("edits lines only while draft and rejects duplicates/unknowns", () => {
    let inv = addInvoiceLine(draft(), { key: "lab", description: "Lab", amountMinor: 30000 });
    expect(inv.lines).toHaveLength(3);
    inv = updateInvoiceLineAmount(inv, "lab", 40000);
    inv = removeInvoiceLine(inv, "transport");
    expect(invoiceTotalMinor(inv)).toBe(540000);
    expect(() =>
      addInvoiceLine(inv, { key: "tuition", description: "Dup", amountMinor: 1 }),
    ).toThrow(DuplicateInvoiceLineKeyError);
    expect(() => removeInvoiceLine(inv, "missing")).toThrow(InvoiceLineNotFoundError);
    expect(() => draftInvoice({ ...params, lines: [] })).not.toThrow();
    expect(() => issueInvoice(draftInvoice({ ...params, lines: [] }))).toThrow(EmptyInvoiceError);
  });

  it("applies payments to partially_paid then paid, rejecting overpayment and post-paid tender", () => {
    const partial = applyPaymentToInvoice(issued(), 200000);
    expect(partial.status).toBe("partially_paid");
    expect(partial.amountPaidMinor).toBe(200000);
    expect(invoiceOutstandingMinor(partial)).toBe(400000);

    const paid = applyPaymentToInvoice(partial, 400000);
    expect(paid.status).toBe("paid");
    expect(isInvoiceSettled(paid)).toBe(true);
    expect(invoiceOutstandingMinor(paid)).toBe(0);

    expect(() => applyPaymentToInvoice(paid, 1)).toThrow(InvoiceNotPayableError);
    expect(() => applyPaymentToInvoice(issued(), 600001)).toThrow(PaymentExceedsOutstandingError);
  });

  it("reverses payments, floor-guarding the paid amount", () => {
    const paid = applyPaymentToInvoice(issued(), 600000);
    const back = reversePaymentFromInvoice(paid, 100000);
    expect(back.status).toBe("partially_paid");
    expect(back.amountPaidMinor).toBe(500000);

    const zero = reversePaymentFromInvoice(back, 500000);
    expect(zero.status).toBe("issued");
    expect(zero.amountPaidMinor).toBe(0);

    expect(() => reversePaymentFromInvoice(issued(), 1)).toThrow(ReversalExceedsPaidError);
    expect(() => reversePaymentFromInvoice(draft(), 1)).toThrow(InvoiceNotPayableError);
  });

  it("marks overdue and cancels only when unpaid", () => {
    expect(markInvoiceOverdue(issued()).status).toBe("overdue");
    expect(() => markInvoiceOverdue(draft())).toThrow(InvalidInvoiceTransitionError);

    expect(cancelInvoice(draft()).status).toBe("cancelled");
    expect(() => cancelInvoice(applyPaymentToInvoice(issued(), 600000))).toThrow(
      InvalidInvoiceTransitionError,
    );
    expect(() => cancelInvoice(applyPaymentToInvoice(issued(), 100000))).toThrow(
      InvoiceHasPaymentsError,
    );
  });
});
