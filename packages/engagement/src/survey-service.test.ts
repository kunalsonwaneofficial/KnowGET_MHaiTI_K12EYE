import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { SurveyService } from "./survey-service";
import { archiveAudience, createAudience } from "./audience";
import type { SurveyQuestion } from "./survey";
import type { OrganizationDirectory } from "./ports";
import { InMemoryAudienceRepository, InMemorySurveyRepository } from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const organizations: OrganizationDirectory = {
  async exists(_t: TenantId, id: Uuid) {
    return id === organizationId;
  },
};

const questions: SurveyQuestion[] = [
  { key: "q1", prompt: "Rate us", type: "rating", options: ["1", "2", "3"], required: true },
];

const setup = async () => {
  const repository = new InMemorySurveyRepository();
  const audiences = new InMemoryAudienceRepository();
  const events: DomainEvent[] = [];
  const audience = createAudience({ tenantId, organizationId, code: "AUD-1", name: "Parents" });
  await audiences.save(audience);
  const service = new SurveyService({
    repository,
    audiences,
    organizations,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, audiences, service, audience, events };
};

describe("SurveyService", () => {
  it("creates a survey against an active audience (deriving org) and runs the lifecycle", async () => {
    const { service, audience, events } = await setup();
    const s = await service.create({
      tenantId,
      audienceId: audience.id,
      title: "Feedback",
      type: "survey",
      questions,
    });
    expect(s.organizationId).toBe(organizationId);
    await service.open(tenantId, s.id, "2026-07-01T00:00:00.000Z");
    await service.close(tenantId, s.id, "2026-07-08T00:00:00.000Z");
    await service.archive(tenantId, s.id);
    const types = new Set(events.map((e) => e.type));
    expect(types.has("engagement.survey.created")).toBe(true);
    expect(types.has("engagement.survey.opened")).toBe(true);
    expect(types.has("engagement.survey.closed")).toBe(true);
    expect(types.has("engagement.survey.archived")).toBe(true);
  });

  it("rejects an unknown or archived audience", async () => {
    const { service, audiences, audience } = await setup();
    await expect(
      service.create({
        tenantId,
        audienceId: "ghost" as Uuid,
        title: "x",
        type: "poll",
        questions,
      }),
    ).rejects.toThrow(/Audience/);
    await audiences.save(archiveAudience(audience));
    await expect(
      service.create({ tenantId, audienceId: audience.id, title: "x", type: "poll", questions }),
    ).rejects.toThrow(/archived/);
  });
});
