import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { LeadService } from "./lead-service";
import { createMarketingCampaign } from "./marketing-campaign";
import type { OrganizationDirectory } from "./ports";
import { InMemoryLeadRepository, InMemoryMarketingCampaignRepository } from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const organizations: OrganizationDirectory = {
  async exists(_t: TenantId, id: Uuid) {
    return id === organizationId;
  },
};

const setup = async () => {
  const repository = new InMemoryLeadRepository();
  const campaigns = new InMemoryMarketingCampaignRepository();
  const events: DomainEvent[] = [];
  const campaign = createMarketingCampaign({
    tenantId,
    organizationId,
    code: "CMP-1",
    name: "Drive",
    channel: "social_media",
  });
  await campaigns.save(campaign);
  const service = new LeadService({
    repository,
    campaigns,
    organizations,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, campaigns, service, campaign, events };
};

describe("LeadService", () => {
  it("creates a lead attributed to a campaign and drives it to converted", async () => {
    const { service, campaign, events } = await setup();
    const l = await service.create({
      tenantId,
      organizationId,
      code: "LEAD-1",
      contactName: "Asha Rao",
      source: "social_media",
      campaignId: campaign.id,
    });
    expect(l.campaignId).toBe(campaign.id);
    await service.contact(tenantId, l.id);
    await service.qualify(tenantId, l.id);
    await service.convert(tenantId, l.id);
    const types = new Set(events.map((e) => e.type));
    expect(types.has("admissions.lead.created")).toBe(true);
    expect(types.has("admissions.lead.converted")).toBe(true);
  });

  it("rejects an unknown organization, an unknown campaign, and a duplicate code", async () => {
    const { service } = await setup();
    await expect(
      service.create({
        tenantId,
        organizationId: "x" as Uuid,
        code: "L2",
        contactName: "n",
        source: "event",
      }),
    ).rejects.toThrow(/Organization/);
    await expect(
      service.create({
        tenantId,
        organizationId,
        code: "L3",
        contactName: "n",
        source: "event",
        campaignId: "ghost" as Uuid,
      }),
    ).rejects.toThrow(/campaign/i);
    await service.create({
      tenantId,
      organizationId,
      code: "L4",
      contactName: "n",
      source: "event",
    });
    await expect(
      service.create({ tenantId, organizationId, code: "L4", contactName: "n2", source: "event" }),
    ).rejects.toThrow(/already in use/);
  });
});
