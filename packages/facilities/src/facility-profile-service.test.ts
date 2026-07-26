import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { registerBuilding } from "./building";
import { commissionSystem } from "./facility-system";
import { FacilityProfileService } from "./facility-profile-service";
import { cancelMaintenanceOrder, reportMaintenanceOrder } from "./maintenance-order";
import {
  InMemoryBuildingRepository,
  InMemoryFacilityProfileRepository,
  InMemoryFacilitySystemRepository,
  InMemoryMaintenanceOrderRepository,
  InMemorySpaceRepository,
} from "./ports";
import { createSpace, makeSpaceAvailable } from "./space";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const setup = async () => {
  const repository = new InMemoryFacilityProfileRepository();
  const buildings = new InMemoryBuildingRepository();
  const spaces = new InMemorySpaceRepository();
  const systems = new InMemoryFacilitySystemRepository();
  const maintenanceOrders = new InMemoryMaintenanceOrderRepository();
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

  const available = makeSpaceAvailable(
    createSpace({
      tenantId,
      organizationId,
      buildingId: building.id,
      code: "R-101",
      type: "classroom",
      floor: 1,
      capacity: 30,
    }),
  );
  const draftSpace = createSpace({
    tenantId,
    organizationId,
    buildingId: building.id,
    code: "R-102",
    type: "classroom",
    floor: 1,
    capacity: 20,
  });
  await spaces.save(available);
  await spaces.save(draftSpace);

  await systems.save(
    commissionSystem({
      tenantId,
      organizationId,
      buildingId: building.id,
      code: "HVAC-1",
      type: "hvac",
      commissionedOn: "2026-01-01",
      serviceIntervalDays: 90,
    }),
  );

  const base = {
    tenantId,
    organizationId,
    buildingId: building.id,
    category: "repair" as const,
    priority: "medium" as const,
    reportedOn: "2026-07-01",
  };
  await maintenanceOrders.save(reportMaintenanceOrder({ ...base, code: "WO-1", summary: "open" }));
  await maintenanceOrders.save(
    cancelMaintenanceOrder(reportMaintenanceOrder({ ...base, code: "WO-2", summary: "cancelled" })),
  );

  const service = new FacilityProfileService({
    repository,
    buildings,
    spaces,
    systems,
    maintenanceOrders,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, service, building, events };
};

describe("FacilityProfileService", () => {
  it("refreshes a building profile from the condition engine and open-order count, and emits", async () => {
    const { service, building, events } = await setup();
    const p = await service.refresh(tenantId, building.id, "2026-07-01T00:00:00.000Z");
    expect(p.spaceCount).toBe(2);
    expect(p.availableSpaceCount).toBe(1);
    expect(p.totalCapacity).toBe(50);
    expect(p.availableCapacity).toBe(30);
    expect(p.readinessPercent).toBe(60); // 30/50
    expect(p.operationalSystemCount).toBe(1);
    expect(p.openMaintenanceCount).toBe(1); // WO-1 open, WO-2 cancelled
    expect(events.map((e) => e.type)).toContain("facilities.profile.refreshed");
  });

  it("upserts one profile per building on repeated refresh", async () => {
    const { service, building } = await setup();
    const first = await service.refresh(tenantId, building.id, "2026-07-01T00:00:00.000Z");
    const second = await service.refresh(tenantId, building.id, "2026-07-02T00:00:00.000Z");
    expect(second.id).toBe(first.id); // same row
    expect(second.refreshedAt).toBe("2026-07-02T00:00:00.000Z");
    const all = await service.listForOrganization(tenantId, organizationId);
    expect(all).toHaveLength(1);
  });

  it("rejects an unknown building and rolls the campus summary", async () => {
    const { service, building } = await setup();
    await expect(service.refresh(tenantId, "missing" as Uuid, "2026-07-01")).rejects.toThrow(
      /Building/,
    );
    await service.refresh(tenantId, building.id, "2026-07-01T00:00:00.000Z");
    const campus = await service.summarizeCampus(tenantId, organizationId);
    expect(campus.buildingCount).toBe(1);
    expect(campus.totalCapacity).toBe(50);
    expect(campus.operationalSystemCount).toBe(1);
  });
});
