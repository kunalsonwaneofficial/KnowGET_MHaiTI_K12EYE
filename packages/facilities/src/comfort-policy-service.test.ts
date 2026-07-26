import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { ComfortPolicyService } from "./comfort-policy-service";
import type { OrganizationDirectory } from "./ports";
import { InMemoryComfortPolicyRepository } from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const organizations: OrganizationDirectory = {
  async exists(_t: TenantId, id: Uuid) {
    return id === organizationId;
  },
};

const setup = () => {
  const repository = new InMemoryComfortPolicyRepository();
  const events: DomainEvent[] = [];
  const service = new ComfortPolicyService({
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

const draft = (service: ComfortPolicyService, name = "Classroom comfort") =>
  service.draft({
    tenantId,
    organizationId,
    name,
    thresholds: [{ metric: "temperature", min: 18, max: 26 }],
  });

describe("ComfortPolicyService", () => {
  it("drafts against a valid organization, then edits and emits", async () => {
    const { service, events } = setup();
    const p = await draft(service);
    expect(p.status).toBe("draft");
    await service.setThresholds(tenantId, p.id, [{ metric: "co2", min: 0, max: 1000 }]);
    const types = new Set(events.map((e) => e.type));
    expect(types.has("facilities.comfort_policy.drafted")).toBe(true);
    expect(types.has("facilities.comfort_policy.updated")).toBe(true);
  });

  it("rejects an unknown organization", async () => {
    const { service } = setup();
    await expect(
      service.draft({ tenantId, organizationId: "missing" as Uuid, name: "x" }),
    ).rejects.toThrow(/Organization/);
  });

  it("enforces one active policy per organization", async () => {
    const { service } = setup();
    const first = await draft(service, "v1");
    await service.activate(tenantId, first.id);
    const second = await draft(service, "v2");
    await expect(service.activate(tenantId, second.id)).rejects.toThrow(/already has an active/);
    // archive the first, then the second can go active
    await service.archive(tenantId, first.id);
    const activated = await service.activate(tenantId, second.id);
    expect(activated.status).toBe("active");
    const active = await service.getActiveForOrganization(tenantId, organizationId);
    expect(active?.id).toBe(second.id);
  });
});
