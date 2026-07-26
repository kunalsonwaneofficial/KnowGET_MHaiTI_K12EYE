import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { AcknowledgementService } from "./acknowledgement-service";
import { createAnnouncement, publishAnnouncement } from "./announcement";
import type { PersonDirectory } from "./ports";
import { InMemoryAcknowledgementRepository, InMemoryAnnouncementRepository } from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const audienceId = "44444444-4444-4444-4444-444444444444" as Uuid;
const authorPersonId = "55555555-5555-5555-5555-555555555555" as Uuid;
const reader = "77777777-7777-7777-7777-777777777777" as Uuid;

const persons: PersonDirectory = {
  async exists(_t: TenantId, id: Uuid) {
    return id === reader || id === authorPersonId;
  },
};

const setup = async (publish = true) => {
  const repository = new InMemoryAcknowledgementRepository();
  const announcements = new InMemoryAnnouncementRepository();
  const events: DomainEvent[] = [];
  let announcement = createAnnouncement({
    tenantId,
    organizationId,
    audienceId,
    authorPersonId,
    title: "Notice",
    body: "Please read.",
    category: "general",
  });
  if (publish) {
    announcement = publishAnnouncement(announcement, "2026-07-01T09:00:00.000Z");
  }
  await announcements.save(announcement);
  const service = new AcknowledgementService({
    repository,
    announcements,
    persons,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, announcements, service, announcement, events };
};

describe("AcknowledgementService", () => {
  it("records a receipt for a published announcement and counts it", async () => {
    const { service, announcement, events } = await setup();
    const r = await service.record({
      tenantId,
      announcementId: announcement.id,
      personId: reader,
      acknowledgedAt: "2026-07-01T10:00:00.000Z",
    });
    expect(r.organizationId).toBe(organizationId);
    expect(events.map((e) => e.type)).toContain("engagement.acknowledgement.recorded");
    expect(await service.countForAnnouncement(tenantId, announcement.id)).toBe(1);
  });

  it("rejects a second acknowledgement by the same person (one per announcement/person)", async () => {
    const { service, announcement } = await setup();
    await service.record({
      tenantId,
      announcementId: announcement.id,
      personId: reader,
      acknowledgedAt: "2026-07-01T10:00:00.000Z",
    });
    await expect(
      service.record({
        tenantId,
        announcementId: announcement.id,
        personId: reader,
        acknowledgedAt: "2026-07-01T11:00:00.000Z",
      }),
    ).rejects.toThrow(/already acknowledged/);
  });

  it("rejects acknowledging an unpublished announcement or an unknown person", async () => {
    const { service, announcement } = await setup(false);
    await expect(
      service.record({
        tenantId,
        announcementId: announcement.id,
        personId: reader,
        acknowledgedAt: "t",
      }),
    ).rejects.toThrow(/not published/);
    const { service: s2, announcement: a2 } = await setup();
    await expect(
      s2.record({
        tenantId,
        announcementId: a2.id,
        personId: "ghost" as Uuid,
        acknowledgedAt: "t",
      }),
    ).rejects.toThrow(/Person/);
  });
});
