import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import type { OrganizationDirectory } from "./ports";
import { InMemoryVisitorRepository } from "./ports";
import { VisitorService } from "./visitor-service";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const organizations: OrganizationDirectory = {
  async exists(_t: TenantId, id: Uuid) {
    return id === organizationId;
  },
};

const setup = () => {
  const repository = new InMemoryVisitorRepository();
  const events: DomainEvent[] = [];
  const service = new VisitorService({
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

const register = (service: VisitorService, code = "V-1") =>
  service.register({ tenantId, organizationId, code, fullName: "Asha Rao", type: "vendor" });

describe("VisitorService", () => {
  it("registers a visitor against a valid organization with a unique code, and emits", async () => {
    const { service, events } = setup();
    const v = await register(service);
    expect(v.status).toBe("active");
    expect(events.map((e) => e.type)).toContain("campus-security.visitor.registered");
    await expect(register(service, "V-1")).rejects.toThrow(/already in use/);
  });

  it("rejects an unknown organization", async () => {
    const { service } = setup();
    await expect(
      service.register({
        tenantId,
        organizationId: "missing" as Uuid,
        code: "V-9",
        fullName: "X",
        type: "guest",
      }),
    ).rejects.toThrow(/Organization/);
  });

  it("drives the block + archive lifecycle with events", async () => {
    const { service, events } = setup();
    const v = await register(service);
    await service.updateContact(tenantId, v.id, { company: "Acme" });
    await service.block(tenantId, v.id);
    await service.unblock(tenantId, v.id);
    await service.archive(tenantId, v.id);
    const types = new Set(events.map((e) => e.type));
    expect(types.has("campus-security.visitor.contact_updated")).toBe(true);
    expect(types.has("campus-security.visitor.blocked")).toBe(true);
    expect(types.has("campus-security.visitor.unblocked")).toBe(true);
    expect(types.has("campus-security.visitor.archived")).toBe(true);
  });
});
