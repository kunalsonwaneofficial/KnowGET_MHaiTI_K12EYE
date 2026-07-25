import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  CurrencyMismatchError,
  DuplicatePayslipError,
  EmployeeNotFoundForFinanceError,
  PayrollRunNotEditableError,
} from "./errors";
import { createPayrollRun, type PayrollRun, processPayrollRun } from "./payroll-run";
import { payslipNetMinor } from "./payslip";
import { PayslipService } from "./payslip-service";
import {
  type EmployeeCompensationDirectory,
  InMemoryPayrollRunRepository,
  InMemoryPayslipRepository,
} from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const EMP = "55555555-5555-5555-5555-555555555555" as Uuid;
const EMP_USD = "66666666-6666-6666-6666-666666666666" as Uuid;

const employees: EmployeeCompensationDirectory = {
  exists: async (_t, id) => id === EMP || id === EMP_USD,
  organizationOf: async (_t, id) => (id === EMP || id === EMP_USD ? ORG : null),
  baseEarnings: async (_t, id) => {
    if (id === EMP) {
      return {
        currency: "INR",
        components: [{ key: "basic", label: "Basic", amountMinor: 5000000 }],
      };
    }
    if (id === EMP_USD) {
      return {
        currency: "USD",
        components: [{ key: "basic", label: "Basic", amountMinor: 100000 }],
      };
    }
    return null;
  },
};

function harness() {
  const events: DomainEvent[] = [];
  const runs = new InMemoryPayrollRunRepository();
  const svc = new PayslipService({
    repository: new InMemoryPayslipRepository(),
    runs,
    employees,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, runs, events };
}

async function draftRun(runs: InMemoryPayrollRunRepository): Promise<PayrollRun> {
  const run = createPayrollRun({
    tenantId: TENANT,
    organizationId: ORG,
    label: "May 2025 payroll",
    currency: "INR",
  });
  await runs.save(run);
  return run;
}

describe("PayslipService (compensation boundary)", () => {
  it("drafts seeding earnings from the employee band, then approves and pays", async () => {
    const { svc, runs, events } = harness();
    const run = await draftRun(runs);
    const p = await svc.draftForEmployee({
      tenantId: TENANT,
      payrollRunId: run.id,
      employeeId: EMP,
      deductions: [{ key: "pf", label: "Provident Fund", amountMinor: 600000 }],
    });
    expect(p.earnings.map((e) => e.key)).toEqual(["basic"]);
    expect(p.currency).toBe("INR");
    expect(payslipNetMinor(p)).toBe(4400000);

    await svc.approve(TENANT, p.id);
    await svc.markPaid(TENANT, p.id);
    expect(events.map((e) => e.type)).toEqual(["finance.payslip.approved", "finance.payslip.paid"]);
  });

  it("rejects unknown employee, currency mismatch, duplicate, and a non-draft run", async () => {
    const { svc, runs } = harness();
    const run = await draftRun(runs);

    await expect(
      svc.draftForEmployee({
        tenantId: TENANT,
        payrollRunId: run.id,
        employeeId: "00000000-0000-0000-0000-000000000000" as Uuid,
      }),
    ).rejects.toBeInstanceOf(EmployeeNotFoundForFinanceError);

    await expect(
      svc.draftForEmployee({ tenantId: TENANT, payrollRunId: run.id, employeeId: EMP_USD }),
    ).rejects.toBeInstanceOf(CurrencyMismatchError);

    await svc.draftForEmployee({ tenantId: TENANT, payrollRunId: run.id, employeeId: EMP });
    await expect(
      svc.draftForEmployee({ tenantId: TENANT, payrollRunId: run.id, employeeId: EMP }),
    ).rejects.toBeInstanceOf(DuplicatePayslipError);

    const frozen = await draftRun(runs);
    await runs.save(processPayrollRun(frozen));
    await expect(
      svc.draftForEmployee({ tenantId: TENANT, payrollRunId: frozen.id, employeeId: EMP }),
    ).rejects.toBeInstanceOf(PayrollRunNotEditableError);
  });
});
