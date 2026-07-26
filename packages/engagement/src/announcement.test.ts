import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  archiveAnnouncement,
  cancelAnnouncement,
  createAnnouncement,
  editAnnouncementContent,
  isAnnouncementPublished,
  pinAnnouncement,
  publishAnnouncement,
  scheduleAnnouncement,
} from "./announcement";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const audienceId = "44444444-4444-4444-4444-444444444444" as Uuid;
const authorPersonId = "55555555-5555-5555-5555-555555555555" as Uuid;

const make = () =>
  createAnnouncement({
    tenantId,
    organizationId,
    audienceId,
    authorPersonId,
    title: "Sports Day",
    body: "Sports day is on Friday.",
    category: "event",
  });

describe("Announcement", () => {
  it("drafts with defaults (normal priority, unpinned)", () => {
    const a = make();
    expect(a.status).toBe("draft");
    expect(a.priority).toBe("normal");
    expect(a.pinned).toBe(false);
    expect(isAnnouncementPublished(a)).toBe(false);
  });

  it("edits content while draft/scheduled, then freezes content once published", () => {
    let a = editAnnouncementContent(make(), "Sports Day (updated)", "Now on Saturday.");
    expect(a.title).toBe("Sports Day (updated)");
    a = publishAnnouncement(a, "2026-07-01T09:00:00.000Z");
    expect(isAnnouncementPublished(a)).toBe(true);
    expect(() => editAnnouncementContent(a, "x", "y")).toThrow(/cannot move/);
  });

  it("runs draft → scheduled → published → archived", () => {
    let a = scheduleAnnouncement(make(), "2026-07-01T08:00:00.000Z");
    expect(a.status).toBe("scheduled");
    a = publishAnnouncement(a, "2026-07-01T09:00:00.000Z");
    expect(a.publishedAt).toBe("2026-07-01T09:00:00.000Z");
    a = pinAnnouncement(a);
    expect(a.pinned).toBe(true);
    a = archiveAnnouncement(a);
    expect(a.status).toBe("archived");
    expect(a.pinned).toBe(false);
  });

  it("cancels only a pre-published announcement, and cannot pin a draft", () => {
    const cancelled = cancelAnnouncement(make());
    expect(cancelled.status).toBe("cancelled");
    expect(() => pinAnnouncement(make())).toThrow(/cannot move/);
    const published = publishAnnouncement(make(), "2026-07-01T09:00:00.000Z");
    expect(() => cancelAnnouncement(published)).toThrow(/cannot move/);
  });

  it("rejects an empty title or body", () => {
    expect(() =>
      createAnnouncement({
        tenantId,
        organizationId,
        audienceId,
        authorPersonId,
        title: " ",
        body: "x",
        category: "general",
      }),
    ).toThrow(/title/);
    expect(() =>
      createAnnouncement({
        tenantId,
        organizationId,
        audienceId,
        authorPersonId,
        title: "x",
        body: " ",
        category: "general",
      }),
    ).toThrow(/body/);
  });
});
