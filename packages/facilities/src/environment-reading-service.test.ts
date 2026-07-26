import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { EnvironmentReadingService } from "./environment-reading-service";
import { InMemoryEnvironmentReadingRepository, InMemorySensorRepository } from "./ports";
import { deactivateSensor, installSensor } from "./sensor";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const buildingId = "33333333-3333-3333-3333-333333333333" as Uuid;
const spaceId = "44444444-4444-4444-4444-444444444444" as Uuid;

const setup = async () => {
  const repository = new InMemoryEnvironmentReadingRepository();
  const sensors = new InMemorySensorRepository();
  const events: DomainEvent[] = [];
  const sensor = installSensor({
    tenantId,
    organizationId,
    buildingId,
    spaceId,
    code: "TMP-1",
    metric: "temperature",
    unit: "°C",
  });
  await sensors.save(sensor);
  const service = new EnvironmentReadingService({
    repository,
    sensors,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, sensors, service, sensor, events };
};

describe("EnvironmentReadingService", () => {
  it("records a reading, deriving space/metric from the sensor and defaulting the unit, and emitting", async () => {
    const { service, sensor, events } = await setup();
    const r = await service.record({
      tenantId,
      sensorId: sensor.id,
      value: 21.5,
      recordedAt: "2026-07-01T09:00:00.000Z",
    });
    expect(r.spaceId).toBe(spaceId);
    expect(r.metric).toBe("temperature");
    expect(r.unit).toBe("°C"); // defaulted from the sensor
    expect(r.value).toBe(21.5);
    expect(events.map((e) => e.type)).toContain("facilities.reading.recorded");
  });

  it("rejects an unknown or inactive sensor", async () => {
    const { service, sensors, sensor } = await setup();
    await expect(
      service.record({
        tenantId,
        sensorId: "missing" as Uuid,
        value: 20,
        recordedAt: "2026-07-01",
      }),
    ).rejects.toThrow(/Sensor/);
    await sensors.save(deactivateSensor(sensor));
    await expect(
      service.record({ tenantId, sensorId: sensor.id, value: 20, recordedAt: "2026-07-01" }),
    ).rejects.toThrow(/not active/);
  });

  it("returns the latest reading per metric in a space", async () => {
    const { service, sensor } = await setup();
    await service.record({
      tenantId,
      sensorId: sensor.id,
      value: 19,
      recordedAt: "2026-07-01T08:00:00.000Z",
    });
    await service.record({
      tenantId,
      sensorId: sensor.id,
      value: 23,
      recordedAt: "2026-07-01T10:00:00.000Z",
    });
    const latest = await service.latestForSpace(tenantId, spaceId);
    expect(latest).toHaveLength(1);
    expect(latest[0]?.value).toBe(23); // the later reading wins
  });
});
