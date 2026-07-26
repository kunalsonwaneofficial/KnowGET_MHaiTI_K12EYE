import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { AlumniEngagementProfileService } from "./alumni-engagement-profile-service";
import { createAlumniEvent, openEvent, scheduleEvent } from "./alumni-event";
import { createAlumniProfile } from "./alumni-profile";
import { joinChapterMembership } from "./chapter-membership";
import { recordContribution } from "./contribution";
import { markAttended, registerForEvent } from "./event-registration";
import { activateMentorship, proposeMentorship } from "./mentorship-connection";
import {
  InMemoryAlumniEngagementProfileRepository,
  InMemoryAlumniEventRepository,
  InMemoryAlumniProfileRepository,
  InMemoryChapterMembershipRepository,
  InMemoryContributionRepository,
  InMemoryEventRegistrationRepository,
  InMemoryMentorshipConnectionRepository,
} from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const chapterId = "cccccccc-cccc-cccc-cccc-cccccccccccc" as Uuid;

const setup = async () => {
  const profiles = new InMemoryAlumniEngagementProfileRepository();
  const alumniProfiles = new InMemoryAlumniProfileRepository();
  const registrations = new InMemoryEventRegistrationRepository();
  const memberships = new InMemoryChapterMembershipRepository();
  const mentorships = new InMemoryMentorshipConnectionRepository();
  const contributions = new InMemoryContributionRepository();
  const alumniEvents = new InMemoryAlumniEventRepository();
  const events: DomainEvent[] = [];

  const alumnus = createAlumniProfile({
    tenantId,
    organizationId,
    alumnusPersonId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as Uuid,
    graduationYear: "2010",
  });
  await alumniProfiles.save(alumnus);
  const mentee = createAlumniProfile({
    tenantId,
    organizationId,
    alumnusPersonId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" as Uuid,
    graduationYear: "2022",
  });
  await alumniProfiles.save(mentee);

  // Two attended events → eventsAttended = 2.
  const e1 = openEvent(
    scheduleEvent(
      createAlumniEvent({
        tenantId,
        organizationId,
        code: "E1",
        name: "Reunion",
        type: "reunion",
        capacity: 100,
      }),
    ),
  );
  const e2 = openEvent(
    scheduleEvent(
      createAlumniEvent({
        tenantId,
        organizationId,
        code: "E2",
        name: "Mixer",
        type: "networking",
        capacity: 50,
      }),
    ),
  );
  await alumniEvents.save(e1);
  await alumniEvents.save(e2);
  for (const e of [e1, e2]) {
    await registrations.save(
      markAttended(
        registerForEvent({
          tenantId,
          organizationId,
          eventId: e.id,
          alumniProfileId: alumnus.id,
          registeredOn: "2026-01-01",
        }),
        "2026-02-01",
      ),
    );
  }

  // One active chapter membership → activeChapters = 1.
  await memberships.save(
    joinChapterMembership({
      tenantId,
      organizationId,
      chapterId,
      alumniProfileId: alumnus.id,
      joinedOn: "2026-01-05",
    }),
  );

  // One active mentorship (as mentor) → activeMentorships = 1.
  await mentorships.save(
    activateMentorship(
      proposeMentorship({
        tenantId,
        organizationId,
        mentorProfileId: alumnus.id,
        menteeProfileId: mentee.id,
        proposedOn: "2026-01-05",
      }),
      "2026-01-10",
    ),
  );

  // One contribution → contributionsCount = 1.
  await contributions.save(
    recordContribution({
      tenantId,
      organizationId,
      alumniProfileId: alumnus.id,
      type: "gift",
      recognitionTier: "patron",
      contributedOn: "2026-03-01",
    }),
  );

  const service = new AlumniEngagementProfileService({
    profiles,
    alumniProfiles,
    registrations,
    memberships,
    mentorships,
    contributions,
    alumniEvents,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { service, profiles, alumnus, e1, events };
};

describe("AlumniEngagementProfileService", () => {
  it("refreshes a per-alumnus engagement profile by rolling activity through the engagement engine", async () => {
    const { service, profiles, alumnus, events } = await setup();
    const profile = await service.refreshForAlumnus(tenantId, alumnus.id);

    expect(profile.eventsAttended).toBe(2);
    expect(profile.activeChapters).toBe(1);
    expect(profile.activeMentorships).toBe(1);
    expect(profile.contributionsCount).toBe(1);
    expect(profile.score).toBe(70); // 2*10 + 1*15 + 1*20 + 1*15
    expect(profile.level).toBe("champion");

    // Persisted, and one profile per alumnus — a second refresh upserts in place.
    const stored = await service.getForAlumnus(tenantId, alumnus.id);
    expect(stored?.id).toBe(profile.id);
    const again = await service.refreshForAlumnus(tenantId, alumnus.id);
    expect(again.id).toBe(profile.id);
    expect((await profiles.listByTenant(tenantId)).length).toBe(1);

    expect(events.map((e) => e.type)).toContain("alumni.engagement_profile.refreshed");
  });

  it("derives live engagement and event participation without persisting", async () => {
    const { service, profiles, alumnus, e1 } = await setup();

    const engagement = await service.engagementForAlumnus(tenantId, alumnus.id);
    expect(engagement).toEqual({ score: 70, level: "champion" });

    const participation = await service.eventParticipation(tenantId, e1.id);
    expect(participation).toMatchObject({
      capacity: 100,
      registeredCount: 1,
      attendedCount: 1,
      remaining: 99,
      overSubscribed: false,
      fillPercent: 1,
      attendanceRate: 100,
    });

    // The read helpers derive on demand — nothing is written.
    expect(await service.getForAlumnus(tenantId, alumnus.id)).toBeNull();
    expect((await profiles.listByTenant(tenantId)).length).toBe(0);
  });

  it("throws for an unknown alumnus", async () => {
    const { service } = await setup();
    await expect(
      service.refreshForAlumnus(tenantId, "00000000-0000-0000-0000-000000000000" as Uuid),
    ).rejects.toThrow(/Alumni profile/);
  });
});
