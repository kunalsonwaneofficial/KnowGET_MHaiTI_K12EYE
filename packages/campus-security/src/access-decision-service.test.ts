import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { AccessDecisionService } from "./access-decision-service";
import { issueCredential, setCredentialExpiry, suspendCredential } from "./access-credential";
import { createAccessZone, lockDownZone } from "./access-zone";
import {
  InMemoryAccessCredentialRepository,
  InMemoryAccessEventRepository,
  InMemoryAccessZoneRepository,
} from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const holderId = "33333333-3333-3333-3333-333333333333" as Uuid;

const setup = async () => {
  const credentials = new InMemoryAccessCredentialRepository();
  const zones = new InMemoryAccessZoneRepository();
  const accessEvents = new InMemoryAccessEventRepository();
  const events: DomainEvent[] = [];
  const zone = createAccessZone({
    tenantId,
    organizationId,
    code: "Z-1",
    name: "Server Room",
    securityLevel: "high_security",
  });
  await zones.save(zone);
  const credential = issueCredential({
    tenantId,
    organizationId,
    credentialNumber: "C-1",
    holderType: "employee",
    holderId,
    grantedZoneIds: [zone.id],
    issuedOn: "2026-07-01",
  });
  await credentials.save(credential);
  const service = new AccessDecisionService({
    credentials,
    zones,
    accessEvents,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { credentials, zones, accessEvents, service, zone, credential, events };
};

describe("AccessDecisionService", () => {
  it("grants an active credential at an active granted zone, recording and emitting the decision", async () => {
    const { service, zone, credential, accessEvents, events } = await setup();
    const e = await service.decide({
      tenantId,
      credentialId: credential.id,
      zoneId: zone.id,
      pointLabel: "Door 1",
      occurredAt: "2026-07-01T09:00:00.000Z",
    });
    expect(e.decision).toBe("granted");
    expect(e.reason).toBe("ok");
    expect(events.map((ev) => ev.type)).toContain("campus-security.access.recorded");
    expect(await accessEvents.listByZone(tenantId, zone.id)).toHaveLength(1);
  });

  it("denies (and still records) for a locked-down zone", async () => {
    const { service, zones, zone, credential } = await setup();
    await zones.save(lockDownZone(zone));
    const denied = await service.decide({
      tenantId,
      credentialId: credential.id,
      zoneId: zone.id,
      occurredAt: "2026-07-01T09:00:00.000Z",
    });
    expect(denied).toMatchObject({ decision: "denied", reason: "zone_locked_down" });
  });

  it("denies (and still records) for a suspended credential", async () => {
    const { service, credentials, zone, credential } = await setup();
    await credentials.save(suspendCredential(credential));
    const denied = await service.decide({
      tenantId,
      credentialId: credential.id,
      zoneId: zone.id,
      occurredAt: "2026-07-01T09:00:00.000Z",
    });
    expect(denied).toMatchObject({ decision: "denied", reason: "credential_inactive" });
  });

  it("does not falsely expire a credential on its own expiry day (date vs timestamp default)", async () => {
    const { service, credentials, zone, credential } = await setup();
    await credentials.save(setCredentialExpiry(credential, "2026-07-01"));
    // a decision at 09:00 on the expiry day (a timestamp occurredAt) is still granted
    const onDay = await service.decide({
      tenantId,
      credentialId: credential.id,
      zoneId: zone.id,
      occurredAt: "2026-07-01T09:00:00.000Z",
    });
    expect(onDay).toMatchObject({ decision: "granted", reason: "ok" });
    // the day after expiry it is denied as expired
    const nextDay = await service.decide({
      tenantId,
      credentialId: credential.id,
      zoneId: zone.id,
      occurredAt: "2026-07-02T09:00:00.000Z",
    });
    expect(nextDay).toMatchObject({ decision: "denied", reason: "credential_expired" });
  });

  it("rejects an unknown credential or zone", async () => {
    const { service, zone, credential } = await setup();
    await expect(
      service.decide({
        tenantId,
        credentialId: "ghost" as Uuid,
        zoneId: zone.id,
        occurredAt: "t",
      }),
    ).rejects.toThrow(/credential/i);
    await expect(
      service.decide({
        tenantId,
        credentialId: credential.id,
        zoneId: "nozone" as Uuid,
        occurredAt: "t",
      }),
    ).rejects.toThrow(/Access zone/);
  });
});
