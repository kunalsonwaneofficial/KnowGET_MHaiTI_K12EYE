import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { EngagementProfileService } from "./engagement-profile-service";
import { createAudience } from "./audience";
import { createAnnouncement, publishAnnouncement } from "./announcement";
import { recordAcknowledgement } from "./acknowledgement";
import { createSurvey, openSurvey } from "./survey";
import { recordSurveyResponse } from "./survey-response";
import {
  InMemoryAcknowledgementRepository,
  InMemoryAnnouncementRepository,
  InMemoryAudienceRepository,
  InMemoryEngagementProfileRepository,
  InMemorySurveyRepository,
  InMemorySurveyResponseRepository,
} from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const authorPersonId = "55555555-5555-5555-5555-555555555555" as Uuid;
const member = (n: number): Uuid => `33333333-3333-3333-3333-33333333330${n}` as Uuid;

const setup = async () => {
  const audiences = new InMemoryAudienceRepository();
  const announcements = new InMemoryAnnouncementRepository();
  const acknowledgements = new InMemoryAcknowledgementRepository();
  const surveys = new InMemorySurveyRepository();
  const responses = new InMemorySurveyResponseRepository();
  const profiles = new InMemoryEngagementProfileRepository();
  const events: DomainEvent[] = [];

  const audience = createAudience({
    tenantId,
    organizationId,
    code: "AUD-1",
    name: "Grade 5 Parents",
    memberPersonIds: [member(1), member(2), member(3), member(4)],
  });
  await audiences.save(audience);

  const draft = (title: string) =>
    createAnnouncement({
      tenantId,
      organizationId,
      audienceId: audience.id,
      authorPersonId,
      title,
      body: "body",
      category: "general",
    });
  const ann1 = publishAnnouncement(draft("A1"), "2026-07-01T09:00:00.000Z");
  const ann2 = publishAnnouncement(draft("A2"), "2026-07-02T09:00:00.000Z");
  await announcements.save(ann1);
  await announcements.save(ann2);

  const ack = (announcementId: Uuid, personId: Uuid) =>
    recordAcknowledgement({
      tenantId,
      organizationId,
      announcementId,
      personId,
      acknowledgedAt: "t",
    });
  await acknowledgements.save(ack(ann1.id, member(1)));
  await acknowledgements.save(ack(ann1.id, member(2)));
  await acknowledgements.save(ack(ann2.id, member(1)));

  const survey = openSurvey(
    createSurvey({
      tenantId,
      organizationId,
      audienceId: audience.id,
      title: "Feedback",
      type: "survey",
      questions: [
        { key: "q1", prompt: "OK?", type: "single_choice", options: ["y", "n"], required: true },
      ],
    }),
    "2026-07-01T00:00:00.000Z",
  );
  await surveys.save(survey);
  await responses.save(
    recordSurveyResponse({
      tenantId,
      organizationId,
      surveyId: survey.id,
      respondentPersonId: member(1),
      answers: [{ questionKey: "q1", values: ["y"] }],
      submittedAt: "t1",
    }),
  );
  await responses.save(
    recordSurveyResponse({
      tenantId,
      organizationId,
      surveyId: survey.id,
      respondentPersonId: member(2),
      answers: [{ questionKey: "q1", values: ["n"] }],
      submittedAt: "t2",
    }),
  );

  const service = new EngagementProfileService({
    repository: profiles,
    audiences,
    announcements,
    acknowledgements,
    surveys,
    responses,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { service, profiles, audience, events };
};

describe("EngagementProfileService (integration spine)", () => {
  it("derives reach and response metrics for an audience and refreshes the profile", async () => {
    const { service, audience, events } = await setup();
    const profile = await service.refresh(tenantId, audience.id, "2026-07-10T00:00:00.000Z");

    expect(profile.audienceSize).toBe(4);
    expect(profile.audienceCode).toBe("AUD-1");
    // two published announcements, 3 acknowledgements over an audience of 4 → 3/8 = 38%
    expect(profile.announcementCount).toBe(2);
    expect(profile.totalAcknowledged).toBe(3);
    expect(profile.acknowledgementPercent).toBe(38);
    // one survey, two responses over an audience of 4 → 50%
    expect(profile.surveyCount).toBe(1);
    expect(profile.totalResponses).toBe(2);
    expect(profile.responsePercent).toBe(50);
    expect(events.map((e) => e.type)).toContain("engagement.profile.refreshed");
  });

  it("refreshes the same profile in place (one per audience)", async () => {
    const { service, audience } = await setup();
    const first = await service.refresh(tenantId, audience.id, "2026-07-10T00:00:00.000Z");
    const second = await service.refresh(tenantId, audience.id, "2026-07-11T00:00:00.000Z");
    expect(second.id).toBe(first.id);
    expect(second.refreshedAt).toBe("2026-07-11T00:00:00.000Z");
  });

  it("rejects refreshing an unknown audience", async () => {
    const { service } = await setup();
    await expect(service.refresh(tenantId, "ghost" as Uuid, "t")).rejects.toThrow(/Audience/);
  });
});
