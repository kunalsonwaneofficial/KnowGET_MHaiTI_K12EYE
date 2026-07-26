import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { ChapterMembershipService } from "./chapter-membership-service";
import { activateChapter, archiveChapter, createAlumniChapter } from "./alumni-chapter";
import { createAlumniProfile } from "./alumni-profile";
import {
  InMemoryAlumniChapterRepository,
  InMemoryAlumniProfileRepository,
  InMemoryChapterMembershipRepository,
} from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const alumnusPersonId = "33333333-3333-3333-3333-333333333333" as Uuid;

const setup = async (chapterActive = true) => {
  const repository = new InMemoryChapterMembershipRepository();
  const chapters = new InMemoryAlumniChapterRepository();
  const profiles = new InMemoryAlumniProfileRepository();
  const events: DomainEvent[] = [];

  let chapter = createAlumniChapter({
    tenantId,
    organizationId,
    code: "BAY",
    name: "Bay Area",
    type: "regional",
  });
  chapter = chapterActive ? activateChapter(chapter) : archiveChapter(chapter);
  await chapters.save(chapter);

  const profile = createAlumniProfile({
    tenantId,
    organizationId,
    alumnusPersonId,
    graduationYear: "2015",
  });
  await profiles.save(profile);

  const service = new ChapterMembershipService({
    repository,
    chapters,
    profiles,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, service, chapter, profile, events };
};

describe("ChapterMembershipService", () => {
  it("joins, rejects a duplicate active join, and reactivates a returning alumnus (one row)", async () => {
    const { repository, service, chapter, profile, events } = await setup();
    const m = await service.join({
      tenantId,
      chapterId: chapter.id,
      alumniProfileId: profile.id,
      joinedOn: "2026-01-10",
    });
    await expect(
      service.join({ tenantId, chapterId: chapter.id, alumniProfileId: profile.id, joinedOn: "d" }),
    ).rejects.toThrow(/already an active member/);

    await service.leave(tenantId, m.id, "2026-06-01");
    const rejoined = await service.join({
      tenantId,
      chapterId: chapter.id,
      alumniProfileId: profile.id,
      joinedOn: "2026-09-01",
    });
    expect(rejoined.id).toBe(m.id); // reactivated the same row, not a duplicate
    expect(rejoined.status).toBe("active");
    expect((await repository.listByChapter(tenantId, chapter.id)).length).toBe(1);
    expect(events.map((e) => e.type)).toContain("alumni.membership.reactivated");
  });

  it("rejects joining a non-joinable chapter and an unknown alumnus", async () => {
    const { service: archived, chapter: cc, profile: pp } = await setup(false);
    await expect(
      archived.join({ tenantId, chapterId: cc.id, alumniProfileId: pp.id, joinedOn: "d" }),
    ).rejects.toThrow(/not accepting members/);

    const { service, chapter } = await setup();
    await expect(
      service.join({
        tenantId,
        chapterId: chapter.id,
        alumniProfileId: "00000000-0000-0000-0000-000000000000" as Uuid,
        joinedOn: "d",
      }),
    ).rejects.toThrow(/Alumni profile/);
  });
});
