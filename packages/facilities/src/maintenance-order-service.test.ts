import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { registerBuilding } from "./building";
import { commissionSystem } from "./facility-system";
import { MaintenanceOrderService } from "./maintenance-order-service";
import type { EmployeeDirectory } from "./ports";
import {
  InMemoryBuildingRepository,
  InMemoryFacilitySystemRepository,
  InMemoryMaintenanceOrderRepository,
  InMemorySpaceRepository,
} from "./ports";
import { createSpace } from "./space";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const employeeId = "66666666-6666-6666-6666-666666666666" as Uuid;

/** A tiny stub over the workforce read model: the one known employee belongs to the org. */
const employees: EmployeeDirectory = {
  async exists(_t: TenantId, id: Uuid) {
    return id === employeeId;
  },
  async organizationOf(_t: TenantId, id: Uuid) {
    return id === employeeId ? organizationId : null;
  },
};

const setup = async () => {
  const repository = new InMemoryMaintenanceOrderRepository();
  const buildings = new InMemoryBuildingRepository();
  const spaces = new InMemorySpaceRepository();
  const systems = new InMemoryFacilitySystemRepository();
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
  const space = createSpace({
    tenantId,
    organizationId,
    buildingId: building.id,
    code: "R-101",
    type: "laboratory",
    floor: 1,
    capacity: 30,
  });
  await spaces.save(space);
  const system = commissionSystem({
    tenantId,
    organizationId,
    buildingId: building.id,
    code: "HVAC-1",
    type: "hvac",
    commissionedOn: "2026-01-01",
    serviceIntervalDays: 90,
  });
  await systems.save(system);
  const service = new MaintenanceOrderService({
    repository,
    buildings,
    spaces,
    systems,
    employees,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, service, building, space, system, events };
};

const report = (service: MaintenanceOrderService, buildingId: Uuid, code = "WO-1") =>
  service.report({
    tenantId,
    buildingId,
    code,
    summary: "Leaking tap",
    category: "repair",
    priority: "medium",
    reportedOn: "2026-07-01",
  });

describe("MaintenanceOrderService", () => {
  it("reports an order against a building+space+system, deriving the org and emitting", async () => {
    const { service, building, space, system, events } = await setup();
    const o = await service.report({
      tenantId,
      buildingId: building.id,
      spaceId: space.id,
      systemId: system.id,
      code: "WO-1",
      summary: "Replace HVAC filter in the lab",
      category: "inspection",
      priority: "high",
      reportedOn: "2026-07-01",
    });
    expect(o.organizationId).toBe(organizationId);
    expect(o.status).toBe("reported");
    expect(o.spaceId).toBe(space.id);
    expect(o.systemId).toBe(system.id);
    expect(events.map((e) => e.type)).toContain("facilities.maintenance.reported");
    await expect(report(service, building.id, "WO-1")).rejects.toThrow(/already in use/);
  });

  it("rejects an unknown building, or a target that is not in that building", async () => {
    const { service, building } = await setup();
    await expect(report(service, "missing" as Uuid)).rejects.toThrow(/Building/);
    await expect(
      service.report({
        tenantId,
        buildingId: building.id,
        spaceId: "44444444-4444-4444-4444-444444444444" as Uuid,
        code: "WO-9",
        summary: "x",
        category: "repair",
        priority: "low",
        reportedOn: "2026-07-01",
      }),
    ).rejects.toThrow(/Space/);
  });

  it("validates the assignee and drives the full lifecycle with events", async () => {
    const { service, building, events } = await setup();
    const o = await report(service, building.id);
    await expect(
      service.assign(tenantId, o.id, "99999999-9999-9999-9999-999999999999" as Uuid, "2026-07-02"),
    ).rejects.toThrow(/Employee/);
    await service.assign(tenantId, o.id, employeeId, "2026-07-02");
    await service.setPriority(tenantId, o.id, "urgent");
    await service.start(tenantId, o.id);
    await service.complete(tenantId, o.id, "2026-07-05");
    const types = new Set(events.map((e) => e.type));
    expect(types.has("facilities.maintenance.assigned")).toBe(true);
    expect(types.has("facilities.maintenance.reprioritized")).toBe(true);
    expect(types.has("facilities.maintenance.started")).toBe(true);
    expect(types.has("facilities.maintenance.completed")).toBe(true);
  });

  it("cancels an open order and lists open orders", async () => {
    const { service, building, events } = await setup();
    const o = await report(service, building.id);
    await report(service, building.id, "WO-2");
    await service.cancel(tenantId, o.id);
    expect(events.map((e) => e.type)).toContain("facilities.maintenance.cancelled");
    const open = await service.listOpen(tenantId);
    expect(open).toHaveLength(1); // WO-2 still open, WO-1 cancelled
    expect(open[0]?.code).toBe("WO-2");
  });
});
