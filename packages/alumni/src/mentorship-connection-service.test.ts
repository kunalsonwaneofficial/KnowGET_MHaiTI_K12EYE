import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { MentorshipConnectionService } from "./mentorship-connection-service";
import { createAlumniProfile } from "./alumni-profile";
import { InMemoryAlumniProfileRepository, InMemoryMentorshipConnectionRepository } from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const setup = async () => {
  const repository = new InMemoryMentorshipConnectionRepository();
  const profiles = new InMemoryAlumniProfileRepository();
  const events: DomainEvent[] = [];
  const mentor = createAlumniProfile({
    tenantId,
    organizationId,
    alumnusPersonId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as Uuid,
    graduationYear: "2005",
  });
  const mentee = createAlumniProfile({
    tenantId,
    organizationId,
    alumnusPersonId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" as Uuid,
    graduationYear: "2020",
  });
  await profiles.save(mentor);
  await profiles.save(mentee);
  const service = new MentorshipConnectionService({
    repository,
    profiles,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { service, mentor, mentee, events };
};

describe("MentorshipConnectionService", () => {
  it("proposes (validating both profiles) then activates and completes with events", async () => {
    const { service, mentor, mentee, events } = await setup();
    const m = await service.propose({
      tenantId,
      mentorProfileId: mentor.id,
      menteeProfileId: mentee.id,
      proposedOn: "2026-01-05",
      focus: "Careers",
    });
    await service.activate(tenantId, m.id, "2026-01-10");
    await service.complete(tenantId, m.id, "2026-06-10");
    const types = new Set(events.map((e) => e.type));
    expect(types.has("alumni.mentorship.proposed")).toBe(true);
    expect(types.has("alumni.mentorship.completed")).toBe(true);
  });

  it("rejects a self-mentorship and an unknown mentee", async () => {
    const { service, mentor, mentee } = await setup();
    await expect(
      service.propose({
        tenantId,
        mentorProfileId: mentor.id,
        menteeProfileId: mentor.id,
        proposedOn: "d",
      }),
    ).rejects.toThrow(/cannot mentor themselves/);
    await expect(
      service.propose({
        tenantId,
        mentorProfileId: mentee.id,
        menteeProfileId: "00000000-0000-0000-0000-000000000000" as Uuid,
        proposedOn: "d",
      }),
    ).rejects.toThrow(/Alumni profile/);
  });
});
