import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { EmployeeNotFoundForResourceError } from "./errors";
import { type EmployeeDirectory, InMemoryPurchaseRequisitionRepository } from "./ports";
import { PurchaseRequisitionService } from "./purchase-requisition-service";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const EMP = "44444444-4444-4444-4444-444444444444" as Uuid;

const employees: EmployeeDirectory = {
  exists: async (_t, id) => id === EMP,
  organizationOf: async (_t, id) => (id === EMP ? ORG : null),
};

function service(): { svc: PurchaseRequisitionService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const svc = new PurchaseRequisitionService({
    repository: new InMemoryPurchaseRequisitionRepository(),
    employees,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

const input = () =>
  ({
    tenantId: TENANT,
    requesterId: EMP,
    title: "Classroom supplies",
    currency: "INR",
    lines: [{ key: "pens", description: "Blue pens", quantity: 10, estimatedUnitCostMinor: 5000 }],
  }) as const;

describe("PurchaseRequisitionService", () => {
  it("drafts deriving the organization, submits and approves, publishing events", async () => {
    const { svc, events } = service();
    const r = await svc.draft(input());
    expect(r.organizationId).toBe(ORG);
    await svc.submit(TENANT, r.id);
    await svc.approve(TENANT, r.id, "Approved by principal");
    expect(events.map((e) => e.type)).toEqual([
      "resource.requisition.submitted",
      "resource.requisition.approved",
    ]);
  });

  it("rejects an unknown requester", async () => {
    const { svc } = service();
    await expect(
      svc.draft({ ...input(), requesterId: "00000000-0000-0000-0000-000000000000" as Uuid }),
    ).rejects.toBeInstanceOf(EmployeeNotFoundForResourceError);
  });
});
