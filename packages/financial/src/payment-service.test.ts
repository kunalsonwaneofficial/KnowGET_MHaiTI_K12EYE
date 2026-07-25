import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { PaymentExceedsOutstandingError } from "./errors";
import { InvoiceService } from "./invoice-service";
import { PaymentService } from "./payment-service";
import {
  InMemoryInvoiceRepository,
  InMemoryPaymentRepository,
  type StudentDirectory,
} from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const STUDENT = "33333333-3333-3333-3333-333333333333" as Uuid;

const students: StudentDirectory = {
  exists: async (_t, id) => id === STUDENT,
  organizationOf: async (_t, id) => (id === STUDENT ? ORG : null),
};

function harness(): {
  invoices: InvoiceService;
  payments: PaymentService;
  events: DomainEvent[];
} {
  const events: DomainEvent[] = [];
  const publish = async (e: DomainEvent) => void events.push(e);
  const invoices = new InvoiceService({
    repository: new InMemoryInvoiceRepository(),
    students,
    events: { publish },
  });
  const payments = new PaymentService({
    repository: new InMemoryPaymentRepository(),
    invoices,
    events: { publish },
  });
  return { invoices, payments, events };
}

const draftInput = (number = "INV-001") =>
  ({
    tenantId: TENANT,
    studentId: STUDENT,
    number,
    currency: "INR",
    dueDate: "2025-05-15",
    lines: [{ key: "tuition", description: "Tuition", amountMinor: 600000 }],
  }) as const;

async function issuedInvoice(invoices: InvoiceService, number = "INV-001") {
  const inv = await invoices.draft(draftInput(number));
  await invoices.issue(TENANT, inv.id);
  return inv;
}

describe("PaymentService (billing core)", () => {
  it("clears a partial then a final payment, driving the invoice to paid", async () => {
    const { invoices, payments, events } = harness();
    const inv = await issuedInvoice(invoices);

    const p1 = await payments.record({
      tenantId: TENANT,
      invoiceId: inv.id,
      amountMinor: 200000,
      method: "cash",
      receivedAt: "2025-05-01",
    });
    await payments.clear(TENANT, p1.id);
    expect((await invoices.getById(TENANT, inv.id)).status).toBe("partially_paid");

    const p2 = await payments.record({
      tenantId: TENANT,
      invoiceId: inv.id,
      amountMinor: 400000,
      method: "online",
      receivedAt: "2025-05-10",
    });
    await payments.clear(TENANT, p2.id);
    const settled = await invoices.getById(TENANT, inv.id);
    expect(settled.status).toBe("paid");
    expect(settled.amountPaidMinor).toBe(600000);

    // invoice.paid is published inside applyClearedPayment, before the final payment.cleared emit.
    expect(events.map((e) => e.type)).toEqual([
      "finance.invoice.issued",
      "finance.payment.recorded",
      "finance.payment.cleared",
      "finance.payment.recorded",
      "finance.invoice.paid",
      "finance.payment.cleared",
    ]);
  });

  it("refunds a cleared payment, reversing it off the invoice", async () => {
    const { invoices, payments } = harness();
    const inv = await issuedInvoice(invoices);
    const p = await payments.record({
      tenantId: TENANT,
      invoiceId: inv.id,
      amountMinor: 600000,
      method: "bank_transfer",
      receivedAt: "2025-05-01",
    });
    await payments.clear(TENANT, p.id);
    expect((await invoices.getById(TENANT, inv.id)).status).toBe("paid");

    await payments.refund(TENANT, p.id);
    const reversed = await invoices.getById(TENANT, inv.id);
    expect(reversed.status).toBe("issued");
    expect(reversed.amountPaidMinor).toBe(0);
    expect((await payments.getById(TENANT, p.id)).status).toBe("refunded");
  });

  it("rejects an overpayment at clear time, leaving the payment pending and invoice unchanged", async () => {
    const { invoices, payments } = harness();
    const inv = await issuedInvoice(invoices);
    const p = await payments.record({
      tenantId: TENANT,
      invoiceId: inv.id,
      amountMinor: 700000,
      method: "card",
      receivedAt: "2025-05-01",
    });
    await expect(payments.clear(TENANT, p.id)).rejects.toBeInstanceOf(
      PaymentExceedsOutstandingError,
    );
    expect((await payments.getById(TENANT, p.id)).status).toBe("pending");
    expect((await invoices.getById(TENANT, inv.id)).status).toBe("issued");
  });
});
