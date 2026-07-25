import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { DuplicateSkuError, OrganizationNotFoundForResourceError } from "./errors";
import { InventoryItemService } from "./inventory-item-service";
import { InMemoryInventoryItemRepository, type OrganizationDirectory } from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;

const orgDir: OrganizationDirectory = { exists: async (_t, id) => id === ORG };

function service(): { svc: InventoryItemService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const svc = new InventoryItemService({
    repository: new InMemoryInventoryItemRepository(),
    organizations: orgDir,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

const input = (sku = "PEN-BLUE") =>
  ({
    tenantId: TENANT,
    organizationId: ORG,
    sku,
    name: "Blue Pen",
    unitOfMeasure: "box",
    reorderLevel: 10,
  }) as const;

describe("InventoryItemService", () => {
  it("creates, enforces a unique SKU, and publishes an event", async () => {
    const { svc, events } = service();
    const i = await svc.create(input());
    expect(events.map((e) => e.type)).toEqual(["resource.item.created"]);
    await expect(svc.create(input("PEN-BLUE"))).rejects.toBeInstanceOf(DuplicateSkuError);
    expect((await svc.getBySku(TENANT, "PEN-BLUE")).id).toBe(i.id);
  });

  it("rejects an unknown organization", async () => {
    const { svc } = service();
    await expect(
      svc.create({ ...input(), organizationId: "00000000-0000-0000-0000-000000000000" as Uuid }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForResourceError);
  });

  it("edits and drives active ↔ discontinued, publishing events", async () => {
    const { svc, events } = service();
    const i = await svc.create(input());
    await svc.setReorderLevel(TENANT, i.id, 25);
    await svc.setStandardCost(TENANT, i.id, 6000, "INR");
    await svc.discontinue(TENANT, i.id);
    await svc.reactivate(TENANT, i.id);
    expect((await svc.getById(TENANT, i.id)).reorderLevel).toBe(25);
    expect(events.map((e) => e.type)).toEqual([
      "resource.item.created",
      "resource.item.discontinued",
      "resource.item.reactivated",
    ]);
  });
});
