import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { ContributionService } from "./contribution-service";
import { createAlumniProfile } from "./alumni-profile";
import { InMemoryAlumniProfileRepository, InMemoryContributionRepository } from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const setup = async () => {
  const repository = new InMemoryContributionRepository();
  const profiles = new InMemoryAlumniProfileRepository();
  const events: DomainEvent[] = [];
  const profile = createAlumniProfile({
    tenantId,
    organizationId,
    alumnusPersonId: "33333333-3333-3333-3333-333333333333" as Uuid,
    graduationYear: "2010",
  });
  await profiles.save(profile);
  const service = new ContributionService({
    repository,
    profiles,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { service, profile, events };
};

describe("ContributionService", () => {
  it("records a contribution (deriving org) and emits the recorded event", async () => {
    const { service, profile, events } = await setup();
    const c = await service.record({
      tenantId,
      alumniProfileId: profile.id,
      type: "gift",
      recognitionTier: "benefactor",
      contributedOn: "2026-04-01",
    });
    expect(c.organizationId).toBe(organizationId);
    expect(await service.countForAlumnus(tenantId, profile.id)).toBe(1);
    expect(events.map((e) => e.type)).toContain("alumni.contribution.recorded");
  });

  it("rejects a contribution for an unknown alumnus", async () => {
    const { service } = await setup();
    await expect(
      service.record({
        tenantId,
        alumniProfileId: "00000000-0000-0000-0000-000000000000" as Uuid,
        type: "gift",
        recognitionTier: "supporter",
        contributedOn: "2026-04-01",
      }),
    ).rejects.toThrow(/Alumni profile/);
  });
});
