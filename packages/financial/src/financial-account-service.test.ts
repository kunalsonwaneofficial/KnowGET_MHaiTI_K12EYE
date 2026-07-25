import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { FinancialAccountService } from "./financial-account-service";
import { applyPaymentToInvoice, draftInvoice, issueInvoice, markInvoiceOverdue } from "./invoice";
import { clearPayment, recordPayment } from "./payment";
import {
  InMemoryInvoiceRepository,
  InMemoryPaymentRepository,
  InMemoryStudentFinancialAccountRepository,
  type StudentDirectory,
} from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const STUDENT = "33333333-3333-3333-3333-333333333333" as Uuid;
const STUDENT2 = "44444444-4444-4444-4444-444444444444" as Uuid;

const students: StudentDirectory = {
  exists: async (_t, id) => id === STUDENT || id === STUDENT2,
  organizationOf: async (_t, id) => (id === STUDENT || id === STUDENT2 ? ORG : null),
};

describe("FinancialAccountService", () => {
  it("reconciles invoices against payments and rolls up receivables", async () => {
    const invoicesRepo = new InMemoryInvoiceRepository();
    const paymentsRepo = new InMemoryPaymentRepository();
    const accountsRepo = new InMemoryStudentFinancialAccountRepository();

    // STUDENT: an issued 80000 invoice with a cleared 40000 payment applied → partially paid.
    let inv1 = issueInvoice(
      draftInvoice({
        tenantId: TENANT,
        organizationId: ORG,
        studentId: STUDENT,
        number: "INV-1",
        currency: "INR",
        dueDate: "2025-05-15",
        lines: [{ key: "tuition", description: "Tuition", amountMinor: 80000 }],
      }),
    );
    const pay1 = clearPayment(
      recordPayment({
        tenantId: TENANT,
        organizationId: ORG,
        studentId: STUDENT,
        invoiceId: inv1.id,
        amountMinor: 40000,
        currency: "INR",
        method: "cash",
        receivedAt: "2025-05-01",
      }),
    );
    inv1 = applyPaymentToInvoice(inv1, 40000);
    await invoicesRepo.save(inv1);
    await paymentsRepo.save(pay1);

    // STUDENT2: an overdue 30000 invoice, unpaid.
    const inv2 = markInvoiceOverdue(
      issueInvoice(
        draftInvoice({
          tenantId: TENANT,
          organizationId: ORG,
          studentId: STUDENT2,
          number: "INV-2",
          currency: "INR",
          dueDate: "2025-04-01",
          lines: [{ key: "tuition", description: "Tuition", amountMinor: 30000 }],
        }),
      ),
    );
    await invoicesRepo.save(inv2);

    const svc = new FinancialAccountService({
      repository: accountsRepo,
      invoices: invoicesRepo,
      payments: paymentsRepo,
      students,
    });

    const a1 = await svc.refresh(TENANT, STUDENT);
    expect(a1.totalBilledMinor).toBe(80000);
    expect(a1.totalPaidMinor).toBe(40000);
    expect(a1.outstandingMinor).toBe(40000);
    expect(a1.standing).toBe("outstanding");

    const a2 = await svc.refresh(TENANT, STUDENT2);
    expect(a2.outstandingMinor).toBe(30000);
    expect(a2.overdueMinor).toBe(30000);
    expect(a2.standing).toBe("overdue");

    const summary = await svc.receivablesFor(TENANT, ORG, "INR");
    expect(summary.accountCount).toBe(2);
    expect(summary.totalOutstandingMinor).toBe(70000);
    expect(summary.totalOverdueMinor).toBe(30000);
    expect(summary.inArrearsCount).toBe(1);
    expect(summary.standingDistribution.outstanding).toBe(1);
    expect(summary.standingDistribution.overdue).toBe(1);
  });

  it("refreshes an existing account in place, bumping the version", async () => {
    const invoicesRepo = new InMemoryInvoiceRepository();
    const paymentsRepo = new InMemoryPaymentRepository();
    const accountsRepo = new InMemoryStudentFinancialAccountRepository();
    const inv = issueInvoice(
      draftInvoice({
        tenantId: TENANT,
        organizationId: ORG,
        studentId: STUDENT,
        number: "INV-1",
        currency: "INR",
        dueDate: "2025-05-15",
        lines: [{ key: "tuition", description: "Tuition", amountMinor: 50000 }],
      }),
    );
    await invoicesRepo.save(inv);
    const svc = new FinancialAccountService({
      repository: accountsRepo,
      invoices: invoicesRepo,
      payments: paymentsRepo,
      students,
    });
    const first = await svc.refresh(TENANT, STUDENT);
    const second = await svc.refresh(TENANT, STUDENT);
    expect(second.id).toBe(first.id);
    expect(second.version).toBe(2);
  });
});
