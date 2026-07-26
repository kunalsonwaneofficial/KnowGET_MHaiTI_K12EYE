import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { createAccessZone } from "./access-zone";
import { EmergencyDrillService } from "./emergency-drill-service";
import type { EmployeeDirectory, OrganizationDirectory } from "./ports";
import { InMemoryAccessZoneRepository, InMemoryEmergencyDrillRepository } from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const conductorId = "66666666-6666-6666-6666-666666666666" as Uuid;

const organizations: OrganizationDirectory = {
  async exists(_t: TenantId, id: Uuid) {
    return id === organizationId;
  },
};
const employees: EmployeeDirectory = {
  async exists(_t: TenantId, id: Uuid) {
    return id === conductorId;
  },
  async organizationOf(_t: TenantId, id: Uuid) {
    return id === conductorId ? organizationId : null;
  },
};

const setup = async () => {
  const repository = new InMemoryEmergencyDrillRepository();
  const zones = new InMemoryAccessZoneRepository();
  const events: DomainEvent[] = [];
  const zone = createAccessZone({
    tenantId,
    organizationId,
    code: "Z-1",
    name: "Assembly Ground",
    securityLevel: "public",
  });
  await zones.save(zone);
  const service = new EmergencyDrillService({
    repository,
    organizations,
    zones,
    employees,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, zones, service, zone, events };
};

const schedule = (service: EmergencyDrillService, zoneId: Uuid, code = "DRILL-1") =>
  service.schedule({
    tenantId,
    organizationId,
    code,
    type: "fire",
    zoneId,
    conductedById: conductorId,
    scheduledFor: "2026-07-01T09:00:00.000Z",
    expectedCount: 30,
  });

describe("EmergencyDrillService", () => {
  it("schedules against a valid org/zone/conductor, runs the lifecycle, and derives the muster status", async () => {
    const { service, zone, events } = await setup();
    const d = await schedule(service, zone.id);
    expect(d.status).toBe("scheduled");
    await service.start(tenantId, d.id, "2026-07-01T09:05:00.000Z");
    await service.recordMuster(tenantId, d.id, 27);
    const muster = await service.musterStatus(tenantId, d.id);
    expect(muster).toMatchObject({ expectedCount: 30, accountedCount: 27, unaccountedFor: 3 });
    await service.complete(tenantId, d.id, "2026-07-01T09:20:00.000Z");
    const types = new Set(events.map((e) => e.type));
    expect(types.has("campus-security.drill.scheduled")).toBe(true);
    expect(types.has("campus-security.drill.started")).toBe(true);
    expect(types.has("campus-security.drill.muster_recorded")).toBe(true);
    expect(types.has("campus-security.drill.completed")).toBe(true);
    await expect(schedule(service, zone.id, "DRILL-1")).rejects.toThrow(/already in use/);
  });

  it("rejects an unknown org, a foreign zone, and an unknown conductor", async () => {
    const { service, zone } = await setup();
    await expect(
      service.schedule({
        tenantId,
        organizationId: "missing" as Uuid,
        code: "DRILL-9",
        type: "fire",
        scheduledFor: "t",
      }),
    ).rejects.toThrow(/Organization/);
    await expect(schedule(service, "nozone" as Uuid, "DRILL-8")).rejects.toThrow(/Access zone/);
    await expect(
      service.schedule({
        tenantId,
        organizationId,
        code: "DRILL-7",
        type: "fire",
        zoneId: zone.id,
        conductedById: "ghost" as Uuid,
        scheduledFor: "t",
      }),
    ).rejects.toThrow(/Employee/);
  });
});
