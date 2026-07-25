import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { ConcessionService } from "./concession-service";
import { StudentNotFoundForFinanceError } from "./errors";
import { money } from "./money";
import { InMemoryConcessionRepository, type StudentDirectory } from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const STUDENT = "33333333-3333-3333-3333-333333333333" as Uuid;

const students: StudentDirectory = {
  exists: async (_t, id) => id === STUDENT,
  organizationOf: async (_t, id) => (id === STUDENT ? ORG : null),
};

function service(): { svc: ConcessionService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const svc = new ConcessionService({
    repository: new InMemoryConcessionRepository(),
    students,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

describe("ConcessionService", () => {
  it("requests deriving the organization, then approves, publishing events", async () => {
    const { svc, events } = service();
    const c = await svc.request({
      tenantId: TENANT,
      studentId: STUDENT,
      type: "percentage",
      percentage: 25,
      reason: "Merit",
    });
    expect(c.organizationId).toBe(ORG);
    await svc.approve(TENANT, c.id, "Approved by principal");
    expect(events.map((e) => e.type)).toEqual([
      "finance.concession.requested",
      "finance.concession.approved",
    ]);
  });

  it("rejects an unknown student", async () => {
    const { svc } = service();
    await expect(
      svc.request({
        tenantId: TENANT,
        studentId: "00000000-0000-0000-0000-000000000000" as Uuid,
        type: "percentage",
        percentage: 10,
        reason: "x",
      }),
    ).rejects.toBeInstanceOf(StudentNotFoundForFinanceError);
  });

  it("computes the money an approved concession takes off a base", async () => {
    const { svc } = service();
    const c = await svc.request({
      tenantId: TENANT,
      studentId: STUDENT,
      type: "percentage",
      percentage: 25,
      reason: "Merit",
    });
    await svc.approve(TENANT, c.id);
    expect(await svc.amountOff(TENANT, c.id, money(100000, "INR"))).toEqual({
      amountMinor: 25000,
      currency: "INR",
    });
  });
});
