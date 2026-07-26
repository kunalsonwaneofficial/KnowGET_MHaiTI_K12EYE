import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { AlumniEventService } from "./alumni-event-service";
import type { OrganizationDirectory } from "./ports";
import { InMemoryAlumniEventRepository } from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const organizations: OrganizationDirectory = {
  async exists(_t: TenantId, id: Uuid) {
    return id === organizationId;
  },
};

const setup = () => {
  const repository = new InMemoryAlumniEventRepository();
  const events: DomainEvent[] = [];
  const service = new AlumniEventService({
    repository,
    organizations,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { service, events };
};

describe("AlumniEventService", () => {
  it("creates, schedules and opens an event with events", async () => {
    const { service, events } = await setup();
    const e = await service.create({
      tenantId,
      organizationId,
      code: "R25",
      name: "Reunion 2025",
      type: "reunion",
      capacity: 100,
    });
    await service.schedule(tenantId, e.id);
    await service.open(tenantId, e.id);
    const types = new Set(events.map((ev) => ev.type));
    expect(types.has("alumni.event.created")).toBe(true);
    expect(types.has("alumni.event.opened")).toBe(true);
  });

  it("rejects an unknown org and a duplicate code", async () => {
    const { service } = await setup();
    await expect(
      service.create({
        tenantId,
        organizationId: "00000000-0000-0000-0000-000000000000" as Uuid,
        code: "R25",
        name: "Reunion",
        type: "reunion",
      }),
    ).rejects.toThrow(/Organization/);
    await service.create({
      tenantId,
      organizationId,
      code: "R25",
      name: "Reunion",
      type: "reunion",
    });
    await expect(
      service.create({ tenantId, organizationId, code: "R25", name: "Dup", type: "networking" }),
    ).rejects.toThrow(/already in use/);
  });
});
