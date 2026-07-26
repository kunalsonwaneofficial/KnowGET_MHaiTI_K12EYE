import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { decommissionBuilding, registerBuilding } from "./building";
import { FacilitySystemService } from "./facility-system-service";
import { InMemoryBuildingRepository, InMemoryFacilitySystemRepository } from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const setup = async () => {
  const repository = new InMemoryFacilitySystemRepository();
  const buildings = new InMemoryBuildingRepository();
  const events: DomainEvent[] = [];
  const building = registerBuilding({
    tenantId,
    organizationId,
    code: "B-1",
    name: "Science Block",
    type: "academic",
    floors: 3,
  });
  await buildings.save(building);
  const service = new FacilitySystemService({
    repository,
    buildings,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, buildings, service, building, events };
};

const commission = (service: FacilitySystemService, buildingId: Uuid, code = "HVAC-1") =>
  service.commission({
    tenantId,
    buildingId,
    code,
    type: "hvac",
    commissionedOn: "2026-01-01",
    serviceIntervalDays: 90,
  });

describe("FacilitySystemService", () => {
  it("commissions a system in an active building, deriving the org and emitting", async () => {
    const { service, building, events } = await setup();
    const s = await commission(service, building.id);
    expect(s.organizationId).toBe(organizationId);
    expect(s.status).toBe("operational");
    expect(events.map((e) => e.type)).toContain("facilities.system.commissioned");
    await expect(commission(service, building.id, "HVAC-1")).rejects.toThrow(/already in use/);
  });

  it("rejects an unknown or decommissioned building", async () => {
    const { service, buildings, building } = await setup();
    await expect(commission(service, "missing" as Uuid)).rejects.toThrow(/Building/);
    await buildings.save(decommissionBuilding(building));
    await expect(commission(service, building.id)).rejects.toThrow(/not active/);
  });

  it("records service, edits the interval, and drives the maintenance lifecycle with events", async () => {
    const { service, building, events } = await setup();
    const s = await commission(service, building.id);
    await service.recordService(tenantId, s.id, "2026-06-01");
    await service.setInterval(tenantId, s.id, 30);
    await service.sendToMaintenance(tenantId, s.id);
    await service.returnToService(tenantId, s.id);
    await service.decommission(tenantId, s.id);
    const types = new Set(events.map((e) => e.type));
    expect(types.has("facilities.system.serviced")).toBe(true);
    expect(types.has("facilities.system.interval_set")).toBe(true);
    expect(types.has("facilities.system.sent_to_maintenance")).toBe(true);
    expect(types.has("facilities.system.returned_to_service")).toBe(true);
    expect(types.has("facilities.system.decommissioned")).toBe(true);
  });

  it("derives service status via the pure engine", async () => {
    const { service, building } = await setup();
    const s = await commission(service, building.id);
    // never serviced → ok, no due date
    expect(await service.serviceStatus(tenantId, s.id, "2026-06-01")).toMatchObject({
      band: "ok",
      nextDueOn: null,
    });
    await service.recordService(tenantId, s.id, "2026-01-01"); // due 2026-04-01 (90d)
    expect(await service.serviceStatus(tenantId, s.id, "2026-05-01")).toMatchObject({
      band: "overdue",
      isOverdue: true,
    });
    expect(await service.serviceStatus(tenantId, s.id, "2026-03-25")).toMatchObject({
      band: "due_soon",
    });
    expect(await service.serviceStatus(tenantId, s.id, "2026-03-25", 3)).toMatchObject({
      band: "ok",
    });
  });
});
