import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { createAccessZone } from "./access-zone";
import type { PersonDirectory } from "./ports";
import {
  InMemoryAccessZoneRepository,
  InMemoryVisitRepository,
  InMemoryVisitorRepository,
} from "./ports";
import { VisitService } from "./visit-service";
import { blockVisitor, registerVisitor } from "./visitor";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const hostPersonId = "44444444-4444-4444-4444-444444444444" as Uuid;

const persons: PersonDirectory = {
  async exists(_t: TenantId, id: Uuid) {
    return id === hostPersonId;
  },
};

const setup = async () => {
  const repository = new InMemoryVisitRepository();
  const visitors = new InMemoryVisitorRepository();
  const zones = new InMemoryAccessZoneRepository();
  const events: DomainEvent[] = [];
  const visitor = registerVisitor({
    tenantId,
    organizationId,
    code: "V-1",
    fullName: "Asha Rao",
    type: "vendor",
  });
  await visitors.save(visitor);
  const zone = createAccessZone({
    tenantId,
    organizationId,
    code: "Z-1",
    name: "Main Gate",
    securityLevel: "restricted",
    capacity: 10,
  });
  await zones.save(zone);
  const service = new VisitService({
    repository,
    visitors,
    persons,
    zones,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, visitors, zones, service, visitor, zone, events };
};

const request = (service: VisitService, visitorId: Uuid, zoneId: Uuid) =>
  service.request({
    tenantId,
    visitorId,
    hostPersonId,
    zoneId,
    purpose: "Delivery",
    scheduledFor: "2026-07-01T09:00:00.000Z",
  });

describe("VisitService", () => {
  it("requests then runs the full check-in lifecycle with events", async () => {
    const { service, visitor, zone, events } = await setup();
    const v = await request(service, visitor.id, zone.id);
    expect(v.status).toBe("requested");
    await service.approve(tenantId, v.id);
    await service.checkIn(tenantId, v.id, "2026-07-01T09:05:00.000Z");
    const onSite = await service.listOnSiteForZone(tenantId, zone.id);
    expect(onSite).toHaveLength(1);
    await service.checkOut(tenantId, v.id, "2026-07-01T10:00:00.000Z");
    const types = new Set(events.map((e) => e.type));
    expect(types.has("campus-security.visit.requested")).toBe(true);
    expect(types.has("campus-security.visit.approved")).toBe(true);
    expect(types.has("campus-security.visit.checked_in")).toBe(true);
    expect(types.has("campus-security.visit.checked_out")).toBe(true);
    expect(await service.listOnSiteForZone(tenantId, zone.id)).toHaveLength(0);
  });

  it("rejects a blocked visitor, an unknown host, and an unknown zone", async () => {
    const { service, visitors, visitor, zone } = await setup();
    await expect(
      service.request({
        tenantId,
        visitorId: visitor.id,
        hostPersonId: "nobody" as Uuid,
        zoneId: zone.id,
        scheduledFor: "t",
      }),
    ).rejects.toThrow(/Person/);
    await expect(request(service, "ghost" as Uuid, zone.id)).rejects.toThrow(/Visitor/);
    await expect(request(service, visitor.id, "nozone" as Uuid)).rejects.toThrow(/Access zone/);
    await visitors.save(blockVisitor(visitor));
    await expect(request(service, visitor.id, zone.id)).rejects.toThrow(/not active/);
  });

  it("re-checks the visitor is active on approval", async () => {
    const { service, visitors, visitor, zone } = await setup();
    const v = await request(service, visitor.id, zone.id);
    await visitors.save(blockVisitor(visitor)); // blocked after request
    await expect(service.approve(tenantId, v.id)).rejects.toThrow(/not active/);
  });
});
