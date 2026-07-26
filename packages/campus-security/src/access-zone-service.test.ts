import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { AccessZoneService } from "./access-zone-service";
import type { OrganizationDirectory } from "./ports";
import { InMemoryAccessZoneRepository } from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const organizations: OrganizationDirectory = {
  async exists(_t: TenantId, id: Uuid) {
    return id === organizationId;
  },
};

const setup = () => {
  const repository = new InMemoryAccessZoneRepository();
  const events: DomainEvent[] = [];
  const service = new AccessZoneService({
    repository,
    organizations,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, service, events };
};

const create = (service: AccessZoneService, code = "Z-1") =>
  service.create({
    tenantId,
    organizationId,
    code,
    name: "Main Gate",
    securityLevel: "restricted",
  });

describe("AccessZoneService", () => {
  it("creates a zone against a valid organization with a unique code, and emits", async () => {
    const { service, events } = setup();
    const z = await create(service);
    expect(z.status).toBe("active");
    expect(events.map((e) => e.type)).toContain("campus-security.zone.created");
    await expect(create(service, "Z-1")).rejects.toThrow(/already in use/);
  });

  it("rejects an unknown organization", async () => {
    const { service } = setup();
    await expect(
      service.create({
        tenantId,
        organizationId: "missing" as Uuid,
        code: "Z-9",
        name: "X",
        securityLevel: "public",
      }),
    ).rejects.toThrow(/Organization/);
  });

  it("drives the lockdown + decommission lifecycle with events", async () => {
    const { service, events } = setup();
    const z = await create(service);
    await service.setCapacity(tenantId, z.id, 120);
    await service.lockDown(tenantId, z.id);
    await service.liftLockdown(tenantId, z.id);
    await service.decommission(tenantId, z.id);
    const types = new Set(events.map((e) => e.type));
    expect(types.has("campus-security.zone.capacity_set")).toBe(true);
    expect(types.has("campus-security.zone.locked_down")).toBe(true);
    expect(types.has("campus-security.zone.lockdown_lifted")).toBe(true);
    expect(types.has("campus-security.zone.decommissioned")).toBe(true);
  });
});
