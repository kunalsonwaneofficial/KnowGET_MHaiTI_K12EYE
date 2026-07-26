import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { AccessEventService } from "./access-event-service";
import { InMemoryAccessEventRepository } from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const credentialId = "33333333-3333-3333-3333-333333333333" as Uuid;
const zoneId = "44444444-4444-4444-4444-444444444444" as Uuid;

const setup = () => {
  const repository = new InMemoryAccessEventRepository();
  const events: DomainEvent[] = [];
  const service = new AccessEventService({
    repository,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, service, events };
};

const record = (service: AccessEventService, decision: "granted" | "denied") =>
  service.record({
    tenantId,
    organizationId,
    credentialId,
    zoneId,
    decision,
    reason: decision === "granted" ? "ok" : "zone_locked_down",
    occurredAt: "2026-07-01T09:00:00.000Z",
  });

describe("AccessEventService", () => {
  it("records an event and emits", async () => {
    const { service, events } = setup();
    const e = await record(service, "granted");
    expect(e.decision).toBe("granted");
    expect(events.map((ev) => ev.type)).toContain("campus-security.access.recorded");
    expect(await service.getById(tenantId, e.id)).not.toBeNull();
  });

  it("summarizes a zone's granted/denied activity via the pure engine", async () => {
    const { service } = setup();
    await record(service, "granted");
    await record(service, "denied");
    await record(service, "granted");
    expect(await service.summarizeForZone(tenantId, zoneId)).toEqual({
      total: 3,
      granted: 2,
      denied: 1,
    });
    expect(await service.listForCredential(tenantId, credentialId)).toHaveLength(3);
  });
});
