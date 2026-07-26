import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { decommissionBuilding, registerBuilding } from "./building";
import { InMemoryBuildingRepository, InMemorySpaceRepository } from "./ports";
import { SpaceService } from "./space-service";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const setup = async () => {
  const repository = new InMemorySpaceRepository();
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
  const service = new SpaceService({
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

const create = (service: SpaceService, buildingId: Uuid, code = "R-101") =>
  service.create({ tenantId, buildingId, code, type: "classroom", floor: 1, capacity: 30 });

describe("SpaceService", () => {
  it("creates a space in an active building, deriving the org and emitting", async () => {
    const { service, building, events } = await setup();
    const s = await create(service, building.id);
    expect(s.organizationId).toBe(organizationId);
    expect(s.status).toBe("draft");
    expect(events.map((e) => e.type)).toContain("facilities.space.created");
    await expect(create(service, building.id, "R-101")).rejects.toThrow(/already in use/);
  });

  it("rejects an unknown or decommissioned building", async () => {
    const { service, buildings, building } = await setup();
    await expect(create(service, "missing" as Uuid)).rejects.toThrow(/Building/);
    await buildings.save(decommissionBuilding(building));
    await expect(create(service, building.id)).rejects.toThrow(/not active/);
  });

  it("reconfigures and drives the service lifecycle with events", async () => {
    const { service, building, events } = await setup();
    const s = await create(service, building.id);
    await service.setCapacity(tenantId, s.id, 40);
    await service.makeAvailable(tenantId, s.id);
    await service.takeOutOfService(tenantId, s.id);
    await service.returnToService(tenantId, s.id);
    await service.decommission(tenantId, s.id);
    const types = new Set(events.map((e) => e.type));
    expect(types.has("facilities.space.reconfigured")).toBe(true);
    expect(types.has("facilities.space.made_available")).toBe(true);
    expect(types.has("facilities.space.taken_out_of_service")).toBe(true);
    expect(types.has("facilities.space.returned_to_service")).toBe(true);
    expect(types.has("facilities.space.decommissioned")).toBe(true);
  });
});
