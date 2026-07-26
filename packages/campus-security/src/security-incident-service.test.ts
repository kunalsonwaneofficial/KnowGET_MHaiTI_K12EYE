import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { createAccessZone } from "./access-zone";
import type { EmployeeDirectory, OrganizationDirectory, PersonDirectory } from "./ports";
import { InMemoryAccessZoneRepository, InMemorySecurityIncidentRepository } from "./ports";
import { SecurityIncidentService } from "./security-incident-service";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const reporterId = "55555555-5555-5555-5555-555555555555" as Uuid;
const officerId = "66666666-6666-6666-6666-666666666666" as Uuid;

const organizations: OrganizationDirectory = {
  async exists(_t: TenantId, id: Uuid) {
    return id === organizationId;
  },
};
const persons: PersonDirectory = {
  async exists(_t: TenantId, id: Uuid) {
    return id === reporterId;
  },
};
const employees: EmployeeDirectory = {
  async exists(_t: TenantId, id: Uuid) {
    return id === officerId;
  },
  async organizationOf(_t: TenantId, id: Uuid) {
    return id === officerId ? organizationId : null;
  },
};

const setup = async () => {
  const repository = new InMemorySecurityIncidentRepository();
  const zones = new InMemoryAccessZoneRepository();
  const events: DomainEvent[] = [];
  const zone = createAccessZone({
    tenantId,
    organizationId,
    code: "Z-1",
    name: "Rear Gate",
    securityLevel: "restricted",
  });
  await zones.save(zone);
  const service = new SecurityIncidentService({
    repository,
    organizations,
    zones,
    persons,
    employees,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, zones, service, zone, events };
};

const report = (service: SecurityIncidentService, zoneId: Uuid, code = "INC-1") =>
  service.report({
    tenantId,
    organizationId,
    code,
    category: "trespass",
    severity: "medium",
    zoneId,
    reportedByPersonId: reporterId,
    summary: "Unknown person at the rear gate",
    reportedOn: "2026-07-01",
  });

describe("SecurityIncidentService", () => {
  it("reports an incident against a valid org/zone/reporter, then runs the lifecycle with events", async () => {
    const { service, zone, events } = await setup();
    const i = await report(service, zone.id);
    expect(i.status).toBe("reported");
    await service.triage(tenantId, i.id);
    await service.assign(tenantId, i.id, officerId);
    await service.startInvestigation(tenantId, i.id);
    await service.resolve(tenantId, i.id, "2026-07-03");
    await service.close(tenantId, i.id);
    const types = new Set(events.map((e) => e.type));
    expect(types.has("campus-security.incident.reported")).toBe(true);
    expect(types.has("campus-security.incident.triaged")).toBe(true);
    expect(types.has("campus-security.incident.assigned")).toBe(true);
    expect(types.has("campus-security.incident.investigation_started")).toBe(true);
    expect(types.has("campus-security.incident.resolved")).toBe(true);
    expect(types.has("campus-security.incident.closed")).toBe(true);
    await expect(report(service, zone.id, "INC-1")).rejects.toThrow(/already in use/);
  });

  it("rejects an unknown org, a foreign/unknown zone, an unknown reporter, and an unknown assignee", async () => {
    const { service, zone } = await setup();
    await expect(
      service.report({
        tenantId,
        organizationId: "missing" as Uuid,
        code: "INC-9",
        category: "theft",
        severity: "low",
        summary: "x",
        reportedOn: "d",
      }),
    ).rejects.toThrow(/Organization/);
    await expect(report(service, "nozone" as Uuid, "INC-8")).rejects.toThrow(/Access zone/);
    await expect(
      service.report({
        tenantId,
        organizationId,
        code: "INC-7",
        category: "theft",
        severity: "low",
        zoneId: zone.id,
        reportedByPersonId: "ghost" as Uuid,
        summary: "x",
        reportedOn: "d",
      }),
    ).rejects.toThrow(/Person/);
    const i = await report(service, zone.id, "INC-6");
    await expect(service.assign(tenantId, i.id, "ghost" as Uuid)).rejects.toThrow(/Employee/);
  });
});
