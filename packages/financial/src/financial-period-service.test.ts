import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  DuplicatePeriodCodeError,
  InvalidPeriodTransitionError,
  OrganizationNotFoundForFinanceError,
} from "./errors";
import { FinancialPeriodService } from "./financial-period-service";
import { InMemoryFinancialPeriodRepository, type OrganizationDirectory } from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;

const orgDir: OrganizationDirectory = { exists: async (_t, id) => id === ORG };

function service(): { svc: FinancialPeriodService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const svc = new FinancialPeriodService({
    repository: new InMemoryFinancialPeriodRepository(),
    organizations: orgDir,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

const openInput = (code = "FY25-Q1") =>
  ({
    tenantId: TENANT,
    organizationId: ORG,
    code,
    label: "FY25 Quarter 1",
    startDate: "2025-04-01",
    endDate: "2025-06-30",
  }) as const;

describe("FinancialPeriodService", () => {
  it("opens, enforces a unique code, and publishes an event", async () => {
    const { svc, events } = service();
    const period = await svc.open(openInput());
    expect(period.status).toBe("open");
    expect(events.map((e) => e.type)).toEqual(["finance.period.opened"]);
    await expect(svc.open(openInput("FY25-Q1"))).rejects.toBeInstanceOf(DuplicatePeriodCodeError);
    expect((await svc.getByCode(TENANT, "FY25-Q1")).id).toBe(period.id);
  });

  it("rejects an unknown organization", async () => {
    const { svc } = service();
    await expect(
      svc.open({ ...openInput(), organizationId: "00000000-0000-0000-0000-000000000000" as Uuid }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForFinanceError);
  });

  it("closes then reopens, publishing lifecycle events", async () => {
    const { svc, events } = service();
    const period = await svc.open(openInput());
    await svc.close(TENANT, period.id);
    await svc.reopen(TENANT, period.id);
    expect(events.map((e) => e.type)).toEqual([
      "finance.period.opened",
      "finance.period.closed",
      "finance.period.reopened",
    ]);
    await svc.close(TENANT, period.id);
    await expect(svc.close(TENANT, period.id)).rejects.toBeInstanceOf(InvalidPeriodTransitionError);
  });
});
