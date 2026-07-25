import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { ConcessionService } from "./concession-service";
import { feeStructureTotal } from "./fee-structure";
import { FeeStructureService } from "./fee-structure-service";
import { FinancialAccountService } from "./financial-account-service";
import { FinancialPeriodService } from "./financial-period-service";
import { InvoiceService } from "./invoice-service";
import { PaymentService } from "./payment-service";
import { payslipNetMinor } from "./payslip";
import { PayrollRunService } from "./payroll-run-service";
import { PayslipService } from "./payslip-service";
import {
  type EmployeeCompensationDirectory,
  InMemoryConcessionRepository,
  InMemoryFeeStructureRepository,
  InMemoryFinancialPeriodRepository,
  InMemoryInvoiceRepository,
  InMemoryPaymentRepository,
  InMemoryPayrollRunRepository,
  InMemoryPayslipRepository,
  InMemoryStudentFinancialAccountRepository,
  type OrganizationDirectory,
  type StudentDirectory,
} from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const STUDENT = "33333333-3333-3333-3333-333333333333" as Uuid;
const EMP = "55555555-5555-5555-5555-555555555555" as Uuid;

const organizations: OrganizationDirectory = { exists: async (_t, id) => id === ORG };
const students: StudentDirectory = {
  exists: async (_t, id) => id === STUDENT,
  organizationOf: async (_t, id) => (id === STUDENT ? ORG : null),
};
const employees: EmployeeCompensationDirectory = {
  exists: async (_t, id) => id === EMP,
  organizationOf: async (_t, id) => (id === EMP ? ORG : null),
  baseEarnings: async (_t, id) =>
    id === EMP
      ? { currency: "INR", components: [{ key: "basic", label: "Basic", amountMinor: 5000000 }] }
      : null,
};

describe("finance spine (end to end)", () => {
  it("carries a fee schedule through billing, payment, reconciliation, concession and payroll", async () => {
    const invoicesRepo = new InMemoryInvoiceRepository();
    const paymentsRepo = new InMemoryPaymentRepository();
    const periodsRepo = new InMemoryFinancialPeriodRepository();
    const runsRepo = new InMemoryPayrollRunRepository();

    const feeStructures = new FeeStructureService({
      repository: new InMemoryFeeStructureRepository(),
      organizations,
    });
    const periods = new FinancialPeriodService({ repository: periodsRepo, organizations });
    const invoices = new InvoiceService({ repository: invoicesRepo, students });
    const payments = new PaymentService({ repository: paymentsRepo, invoices });
    const concessions = new ConcessionService({
      repository: new InMemoryConcessionRepository(),
      students,
    });
    const runs = new PayrollRunService({
      repository: runsRepo,
      organizations,
      periods: periodsRepo,
    });
    const payslips = new PayslipService({
      repository: new InMemoryPayslipRepository(),
      runs: runsRepo,
      employees,
    });
    const accounts = new FinancialAccountService({
      repository: new InMemoryStudentFinancialAccountRepository(),
      invoices: invoicesRepo,
      payments: paymentsRepo,
      students,
    });

    // 1. A fee structure, activated (frozen), totalling 600000.
    const fs = await feeStructures.create({
      tenantId: TENANT,
      organizationId: ORG,
      code: "STD-25",
      name: "Standard 2025",
      currency: "INR",
      components: [
        { key: "tuition", name: "Tuition", amountMinor: 500000 },
        { key: "transport", name: "Transport", amountMinor: 100000 },
      ],
    });
    await feeStructures.activate(TENANT, fs.id);
    expect(feeStructureTotal(fs)).toEqual({ amountMinor: 600000, currency: "INR" });

    // 2. A financial period.
    const period = await periods.open({
      tenantId: TENANT,
      organizationId: ORG,
      code: "FY25-Q1",
      label: "FY25 Quarter 1",
      startDate: "2025-04-01",
      endDate: "2025-06-30",
    });

    // 3. An invoice generated from the fee structure, issued.
    const inv = await invoices.draft({
      tenantId: TENANT,
      studentId: STUDENT,
      number: "INV-2025-0001",
      currency: "INR",
      dueDate: "2025-05-15",
      feeStructureId: fs.id,
      lines: fs.components.map((c) => ({
        key: c.key,
        description: c.name,
        amountMinor: c.amountMinor,
      })),
    });
    await invoices.issue(TENANT, inv.id);

    // 4. A partial payment, cleared and applied.
    const p1 = await payments.record({
      tenantId: TENANT,
      invoiceId: inv.id,
      amountMinor: 200000,
      method: "cash",
      receivedAt: "2025-05-01",
    });
    await payments.clear(TENANT, p1.id);

    // 5. Reconcile the account — 400000 still outstanding.
    let account = await accounts.refresh(TENANT, STUDENT);
    expect(account.outstandingMinor).toBe(400000);
    expect(account.standing).toBe("outstanding");

    // 6. Pay the balance; the invoice settles.
    const p2 = await payments.record({
      tenantId: TENANT,
      invoiceId: inv.id,
      amountMinor: 400000,
      method: "online",
      receivedAt: "2025-05-10",
    });
    await payments.clear(TENANT, p2.id);
    expect((await invoices.getById(TENANT, inv.id)).status).toBe("paid");

    // 7. Reconcile again — settled, version bumped.
    account = await accounts.refresh(TENANT, STUDENT);
    expect(account.standing).toBe("settled");
    expect(account.outstandingMinor).toBe(0);
    expect(account.version).toBe(2);

    // 8. A concession, approved, taking 10% off the schedule total.
    const concession = await concessions.request({
      tenantId: TENANT,
      studentId: STUDENT,
      type: "percentage",
      percentage: 10,
      reason: "Merit scholarship",
    });
    await concessions.approve(TENANT, concession.id);
    expect(await concessions.amountOff(TENANT, concession.id, feeStructureTotal(fs))).toEqual({
      amountMinor: 60000,
      currency: "INR",
    });

    // 9. Payroll: a run and a payslip seeded from the employee band, approved and paid out.
    const run = await runs.create({
      tenantId: TENANT,
      organizationId: ORG,
      label: "May 2025 payroll",
      currency: "INR",
      periodId: period.id,
    });
    const slip = await payslips.draftForEmployee({
      tenantId: TENANT,
      payrollRunId: run.id,
      employeeId: EMP,
      deductions: [{ key: "pf", label: "Provident Fund", amountMinor: 600000 }],
    });
    expect(payslipNetMinor(slip)).toBe(4400000);
    await payslips.approve(TENANT, slip.id);
    await runs.process(TENANT, run.id);
    await runs.markPaid(TENANT, run.id);
    await payslips.markPaid(TENANT, slip.id);
    expect((await payslips.getById(TENANT, slip.id)).status).toBe("paid");

    // 10. The organization receivables rollup — one settled account, nothing owed.
    const summary = await accounts.receivablesFor(TENANT, ORG, "INR");
    expect(summary.accountCount).toBe(1);
    expect(summary.totalOutstandingMinor).toBe(0);
    expect(summary.standingDistribution.settled).toBe(1);
  });
});
