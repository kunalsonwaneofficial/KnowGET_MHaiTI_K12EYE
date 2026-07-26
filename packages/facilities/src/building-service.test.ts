import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { BuildingService } from "./building-service";
import { InMemoryBuildingRepository, type OrganizationDirectory } from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const orgDir = (known = true): OrganizationDirectory => ({
  async exists() {
    return known;
  },
});

const setup = (orgKnown = true) => {
  const repository = new InMemoryBuildingRepository();
  const events: DomainEvent[] = [];
  const service = new BuildingService({
    repository,
    organizations: orgDir(orgKnown),
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, service, events };
};

const create = (service: BuildingService, code = "B-1") =>
  service.create({
    tenantId,
    organizationId,
    code,
    name: "Science Block",
    type: "academic",
    floors: 3,
  });

describe("BuildingService", () => {
  it("registers a building, validating org + unique code, and emits", async () => {
    const { service, events } = setup();
    const b = await create(service);
    expect(b.status).toBe("active");
    expect(events.map((e) => e.type)).toContain("facilities.building.registered");
    await expect(create(service, "B-1")).rejects.toThrow(/already in use/);
  });

  it("rejects an unknown organization", async () => {
    const { service } = setup(false);
    await expect(create(service)).rejects.toThrow(/Organization/);
  });

  it("drives the renovation/decommission lifecycle and emits distinct events", async () => {
    const { service, events } = setup();
    const b = await create(service);
    await service.setFloors(tenantId, b.id, 5);
    await service.startRenovation(tenantId, b.id);
    await service.completeRenovation(tenantId, b.id);
    await service.decommission(tenantId, b.id);
    const types = new Set(events.map((e) => e.type));
    expect(types.has("facilities.building.floors_set")).toBe(true);
    expect(types.has("facilities.building.renovation_started")).toBe(true);
    expect(types.has("facilities.building.renovation_completed")).toBe(true);
    expect(types.has("facilities.building.decommissioned")).toBe(true);
  });
});
