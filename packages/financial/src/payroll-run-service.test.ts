import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { FinancialPeriodNotFoundError, OrganizationNotFoundForFinanceError } from "./errors";
import { openFinancialPeriod } from "./financial-period";
import { PayrollRunService } from "./payroll-run-service";
import {
  InMemoryFinancialPeriodRepository,
  InMemoryPayrollRunRepository,
  type OrganizationDirectory,
} from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;

const orgDir: OrganizationDirectory = { exists: async (_t, id) => id === ORG };

describe("PayrollRunService", () => {
  it("creates validating the organization and period, then processes and pays", async () => {
    const events: DomainEvent[] = [];
    const periods = new InMemoryFinancialPeriodRepository();
    const period = openFinancialPeriod({
      tenantId: TENANT,
      organizationId: ORG,
      code: "MAY-25",
      label: "May 2025",
      startDate: "2025-05-01",
      endDate: "2025-05-31",
    });
    await periods.save(period);
    const svc = new PayrollRunService({
      repository: new InMemoryPayrollRunRepository(),
      organizations: orgDir,
      periods,
      events: { publish: async (e: DomainEvent) => void events.push(e) },
    });

    const run = await svc.create({
      tenantId: TENANT,
      organizationId: ORG,
      label: "May 2025 payroll",
      currency: "INR",
      periodId: period.id,
    });
    await svc.process(TENANT, run.id);
    await svc.markPaid(TENANT, run.id);
    expect(events.map((e) => e.type)).toEqual([
      "finance.payroll_run.processed",
      "finance.payroll_run.paid",
    ]);
  });

  it("rejects an unknown organization and an unknown period", async () => {
    const periods = new InMemoryFinancialPeriodRepository();
    const svc = new PayrollRunService({
      repository: new InMemoryPayrollRunRepository(),
      organizations: orgDir,
      periods,
    });
    await expect(
      svc.create({
        tenantId: TENANT,
        organizationId: "00000000-0000-0000-0000-000000000000" as Uuid,
        label: "x",
        currency: "INR",
      }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForFinanceError);
    await expect(
      svc.create({
        tenantId: TENANT,
        organizationId: ORG,
        label: "x",
        currency: "INR",
        periodId: "00000000-0000-0000-0000-000000000000" as Uuid,
      }),
    ).rejects.toBeInstanceOf(FinancialPeriodNotFoundError);
  });
});
