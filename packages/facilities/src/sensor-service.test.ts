import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { InMemorySensorRepository, InMemorySpaceRepository } from "./ports";
import { SensorService } from "./sensor-service";
import { createSpace } from "./space";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const buildingId = "33333333-3333-3333-3333-333333333333" as Uuid;

const setup = async () => {
  const repository = new InMemorySensorRepository();
  const spaces = new InMemorySpaceRepository();
  const events: DomainEvent[] = [];
  const space = createSpace({
    tenantId,
    organizationId,
    buildingId,
    code: "R-101",
    type: "classroom",
    floor: 1,
    capacity: 30,
  });
  await spaces.save(space);
  const service = new SensorService({
    repository,
    spaces,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, spaces, service, space, events };
};

const install = (
  service: SensorService,
  spaceId: Uuid,
  code = "TMP-1",
  metric: "temperature" | "co2" = "temperature",
) => service.install({ tenantId, spaceId, code, metric, unit: "°C" });

describe("SensorService", () => {
  it("installs a sensor, deriving org and building from the space, and emitting", async () => {
    const { service, space, events } = await setup();
    const s = await install(service, space.id);
    expect(s.organizationId).toBe(organizationId);
    expect(s.buildingId).toBe(buildingId);
    expect(s.status).toBe("active");
    expect(events.map((e) => e.type)).toContain("facilities.sensor.installed");
  });

  it("rejects an unknown space", async () => {
    const { service } = await setup();
    await expect(install(service, "missing" as Uuid)).rejects.toThrow(/Space/);
  });

  it("enforces a tenant-unique code and one active sensor per space+metric", async () => {
    const { service, space } = await setup();
    await install(service, space.id, "TMP-1", "temperature");
    // duplicate code (different metric, same code) → rejected
    await expect(install(service, space.id, "TMP-1", "co2")).rejects.toThrow(/already in use/);
    // second active temperature sensor in the same space → rejected
    await expect(install(service, space.id, "TMP-2", "temperature")).rejects.toThrow(
      /active .* sensor already exists/,
    );
    // a different metric is fine
    const co2 = await install(service, space.id, "CO2-1", "co2");
    expect(co2.metric).toBe("co2");
  });

  it("frees the space+metric slot once the sensor is deactivated, and guards reactivation", async () => {
    const { service, space } = await setup();
    const first = await install(service, space.id, "TMP-1", "temperature");
    await service.deactivate(tenantId, first.id);
    // slot freed → a replacement can be installed
    const second = await install(service, space.id, "TMP-2", "temperature");
    expect(second.status).toBe("active");
    // reactivating the first would double up the active slot → rejected
    await expect(service.reactivate(tenantId, first.id)).rejects.toThrow(
      /active .* sensor already exists/,
    );
  });

  it("rejects reactivating an already-active sensor with a transition error, not a false duplicate", async () => {
    const { service, space } = await setup();
    const s = await install(service, space.id);
    // the only active sensor is the one being reactivated → transition error, not duplicate
    await expect(service.reactivate(tenantId, s.id)).rejects.toThrow(/cannot move/);
  });

  it("drives the sensor lifecycle with events", async () => {
    const { service, space, events } = await setup();
    const s = await install(service, space.id);
    await service.setUnit(tenantId, s.id, "K");
    await service.deactivate(tenantId, s.id);
    await service.reactivate(tenantId, s.id);
    await service.retire(tenantId, s.id);
    const types = new Set(events.map((e) => e.type));
    expect(types.has("facilities.sensor.unit_set")).toBe(true);
    expect(types.has("facilities.sensor.deactivated")).toBe(true);
    expect(types.has("facilities.sensor.reactivated")).toBe(true);
    expect(types.has("facilities.sensor.retired")).toBe(true);
  });
});
