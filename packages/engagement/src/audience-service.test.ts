import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { AudienceService } from "./audience-service";
import type { OrganizationDirectory } from "./ports";
import { InMemoryAudienceRepository } from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const organizations: OrganizationDirectory = {
  async exists(_t: TenantId, id: Uuid) {
    return id === organizationId;
  },
};

const setup = () => {
  const repository = new InMemoryAudienceRepository();
  const events: DomainEvent[] = [];
  const service = new AudienceService({
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

describe("AudienceService", () => {
  it("creates an audience, validating the organization and a unique code", async () => {
    const { service, events } = setup();
    const a = await service.create({ tenantId, organizationId, code: "AUD-1", name: "Parents" });
    expect(a.status).toBe("active");
    expect(events.map((e) => e.type)).toContain("engagement.audience.created");

    await expect(
      service.create({ tenantId, organizationId, code: "AUD-1", name: "Dup" }),
    ).rejects.toThrow(/already in use/);
    await expect(
      service.create({ tenantId, organizationId: "missing" as Uuid, code: "AUD-2", name: "x" }),
    ).rejects.toThrow(/Organization/);
  });

  it("drives the member + lifecycle transitions with events", async () => {
    const { service, events } = setup();
    const a = await service.create({ tenantId, organizationId, code: "AUD-3", name: "Staff" });
    const m = "99999999-9999-9999-9999-999999999999" as Uuid;
    await service.addMembers(tenantId, a.id, [m]);
    await service.rename(tenantId, a.id, "All Staff");
    await service.removeMembers(tenantId, a.id, [m]);
    await service.archive(tenantId, a.id);
    const types = new Set(events.map((e) => e.type));
    expect(types.has("engagement.audience.members_added")).toBe(true);
    expect(types.has("engagement.audience.renamed")).toBe(true);
    expect(types.has("engagement.audience.members_removed")).toBe(true);
    expect(types.has("engagement.audience.archived")).toBe(true);
  });
});
