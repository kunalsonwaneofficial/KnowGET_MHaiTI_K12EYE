import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { AnnouncementService } from "./announcement-service";
import { archiveAudience, createAudience } from "./audience";
import type { OrganizationDirectory, PersonDirectory } from "./ports";
import { InMemoryAnnouncementRepository, InMemoryAudienceRepository } from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const authorPersonId = "55555555-5555-5555-5555-555555555555" as Uuid;

const organizations: OrganizationDirectory = {
  async exists(_t: TenantId, id: Uuid) {
    return id === organizationId;
  },
};
const persons: PersonDirectory = {
  async exists(_t: TenantId, id: Uuid) {
    return id === authorPersonId;
  },
};

const setup = async () => {
  const repository = new InMemoryAnnouncementRepository();
  const audiences = new InMemoryAudienceRepository();
  const events: DomainEvent[] = [];
  const audience = createAudience({ tenantId, organizationId, code: "AUD-1", name: "Parents" });
  await audiences.save(audience);
  const service = new AnnouncementService({
    repository,
    audiences,
    organizations,
    persons,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, audiences, service, audience, events };
};

const draftInput = (audienceId: Uuid) => ({
  tenantId,
  audienceId,
  authorPersonId,
  title: "Sports Day",
  body: "On Friday.",
  category: "event" as const,
});

describe("AnnouncementService", () => {
  it("drafts against an active audience, deriving org, and publishes with events", async () => {
    const { service, audience, events } = await setup();
    const a = await service.draft(draftInput(audience.id));
    expect(a.organizationId).toBe(organizationId);
    expect(a.status).toBe("draft");
    await service.publish(tenantId, a.id, "2026-07-01T09:00:00.000Z");
    const types = new Set(events.map((e) => e.type));
    expect(types.has("engagement.announcement.drafted")).toBe(true);
    expect(types.has("engagement.announcement.published")).toBe(true);
  });

  it("rejects an unknown audience, an unknown author, and an archived audience", async () => {
    const { service, audiences, audience } = await setup();
    await expect(service.draft(draftInput("ghost" as Uuid))).rejects.toThrow(/Audience/);
    await expect(
      service.draft({ ...draftInput(audience.id), authorPersonId: "nobody" as Uuid }),
    ).rejects.toThrow(/Person/);
    await audiences.save(archiveAudience(audience));
    await expect(service.draft(draftInput(audience.id))).rejects.toThrow(/archived/);
  });

  it("drives the pin + archive lifecycle", async () => {
    const { service, audience, events } = await setup();
    const a = await service.draft(draftInput(audience.id));
    await service.publish(tenantId, a.id, "2026-07-01T09:00:00.000Z");
    await service.pin(tenantId, a.id);
    await service.unpin(tenantId, a.id);
    await service.archive(tenantId, a.id);
    const types = new Set(events.map((e) => e.type));
    expect(types.has("engagement.announcement.pinned")).toBe(true);
    expect(types.has("engagement.announcement.archived")).toBe(true);
  });
});
