import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { MarketingCampaignService } from "./marketing-campaign-service";
import type { OrganizationDirectory } from "./ports";
import { InMemoryMarketingCampaignRepository } from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const organizations: OrganizationDirectory = {
  async exists(_t: TenantId, id: Uuid) {
    return id === organizationId;
  },
};

const setup = () => {
  const repository = new InMemoryMarketingCampaignRepository();
  const events: DomainEvent[] = [];
  const service = new MarketingCampaignService({
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

describe("MarketingCampaignService", () => {
  it("creates a campaign, validating the organization and a unique code", async () => {
    const { service, events } = setup();
    const c = await service.create({
      tenantId,
      organizationId,
      code: "CMP-1",
      name: "Open Day",
      channel: "event",
    });
    expect(c.status).toBe("draft");
    expect(events.map((e) => e.type)).toContain("admissions.campaign.created");
    await expect(
      service.create({ tenantId, organizationId, code: "CMP-1", name: "Dup", channel: "event" }),
    ).rejects.toThrow(/already in use/);
    await expect(
      service.create({
        tenantId,
        organizationId: "x" as Uuid,
        code: "C2",
        name: "n",
        channel: "print",
      }),
    ).rejects.toThrow(/Organization/);
  });

  it("drives the lifecycle with events", async () => {
    const { service, events } = setup();
    const c = await service.create({
      tenantId,
      organizationId,
      code: "CMP-2",
      name: "Referral drive",
      channel: "referral",
    });
    await service.activate(tenantId, c.id);
    await service.complete(tenantId, c.id);
    const types = new Set(events.map((e) => e.type));
    expect(types.has("admissions.campaign.activated")).toBe(true);
    expect(types.has("admissions.campaign.completed")).toBe(true);
  });
});
