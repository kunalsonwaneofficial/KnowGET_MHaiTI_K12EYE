import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { recordAccessEvent } from "./access-event";
import { issueCredential } from "./access-credential";
import { createAccessZone } from "./access-zone";
import {
  InMemoryAccessCredentialRepository,
  InMemoryAccessEventRepository,
  InMemoryAccessZoneRepository,
  InMemorySafetyProfileRepository,
  InMemorySecurityIncidentRepository,
  InMemoryVisitRepository,
} from "./ports";
import { SafetyProfileService } from "./safety-profile-service";
import { reportIncident } from "./security-incident";
import { approveVisit, checkInVisit, requestVisit } from "./visit";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const visitorId = "33333333-3333-3333-3333-333333333333" as Uuid;
const hostPersonId = "44444444-4444-4444-4444-444444444444" as Uuid;
const holderId = "55555555-5555-5555-5555-555555555555" as Uuid;

const setup = async () => {
  const repository = new InMemorySafetyProfileRepository();
  const zones = new InMemoryAccessZoneRepository();
  const visits = new InMemoryVisitRepository();
  const incidents = new InMemorySecurityIncidentRepository();
  const credentials = new InMemoryAccessCredentialRepository();
  const accessEvents = new InMemoryAccessEventRepository();
  const events: DomainEvent[] = [];

  const zone = createAccessZone({
    tenantId,
    organizationId,
    code: "Z-1",
    name: "Main Gate",
    securityLevel: "restricted",
    capacity: 10,
  });
  await zones.save(zone);

  // one checked-in visit in the zone
  await visits.save(
    checkInVisit(
      approveVisit(
        requestVisit({
          tenantId,
          organizationId,
          visitorId,
          hostPersonId,
          zoneId: zone.id,
          scheduledFor: "2026-07-01T09:00:00.000Z",
        }),
      ),
      "2026-07-01T09:05:00.000Z",
    ),
  );
  // one open incident in the zone
  await incidents.save(
    reportIncident({
      tenantId,
      organizationId,
      code: "INC-1",
      category: "trespass",
      severity: "medium",
      zoneId: zone.id,
      summary: "x",
      reportedOn: "2026-07-01",
    }),
  );
  // one active credential granting the zone
  await credentials.save(
    issueCredential({
      tenantId,
      organizationId,
      credentialNumber: "C-1",
      holderType: "employee",
      holderId,
      grantedZoneIds: [zone.id],
      issuedOn: "2026-07-01",
    }),
  );
  // one granted + one denied access event in the zone
  for (const decision of ["granted", "denied"] as const) {
    await accessEvents.save(
      recordAccessEvent({
        tenantId,
        organizationId,
        credentialId: "cred" as Uuid,
        zoneId: zone.id,
        decision,
        reason: decision === "granted" ? "ok" : "zone_locked_down",
        occurredAt: "2026-07-01T09:00:00.000Z",
      }),
    );
  }

  const service = new SafetyProfileService({
    repository,
    zones,
    visits,
    incidents,
    credentials,
    accessEvents,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, service, zone, events };
};

describe("SafetyProfileService", () => {
  it("refreshes a zone profile from presence, incidents, credentials and access activity, and emits", async () => {
    const { service, zone, events } = await setup();
    const p = await service.refresh(tenantId, zone.id, "2026-07-01T00:00:00.000Z");
    expect(p.onSiteVisitorCount).toBe(1);
    expect(p.available).toBe(9);
    expect(p.openIncidentCount).toBe(1);
    expect(p.activeCredentialCount).toBe(1);
    expect(p.accessGrantedCount).toBe(1);
    expect(p.accessDeniedCount).toBe(1);
    expect(events.map((e) => e.type)).toContain("campus-security.profile.refreshed");
  });

  it("upserts one profile per zone and rolls the campus presence summary", async () => {
    const { service, zone } = await setup();
    const first = await service.refresh(tenantId, zone.id, "2026-07-01T00:00:00.000Z");
    const second = await service.refresh(tenantId, zone.id, "2026-07-02T00:00:00.000Z");
    expect(second.id).toBe(first.id);
    expect(await service.listForOrganization(tenantId, organizationId)).toHaveLength(1);
    const site = await service.summarizeSite(tenantId, organizationId);
    expect(site).toEqual({ zoneCount: 1, onSiteCount: 1, totalCapacity: 10 });
  });

  it("rejects an unknown zone", async () => {
    const { service } = await setup();
    await expect(service.refresh(tenantId, "nozone" as Uuid, "t")).rejects.toThrow(/Access zone/);
  });
});
