import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { SurveyResponseService } from "./survey-response-service";
import { createSurvey, openSurvey, type Survey } from "./survey";
import type { PersonDirectory } from "./ports";
import { InMemorySurveyRepository, InMemorySurveyResponseRepository } from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const audienceId = "44444444-4444-4444-4444-444444444444" as Uuid;
const respondent = "77777777-7777-7777-7777-777777777777" as Uuid;

const persons: PersonDirectory = {
  async exists(_t: TenantId, id: Uuid) {
    return id === respondent;
  },
};

const buildSurvey = (open: boolean): Survey => {
  const s = createSurvey({
    tenantId,
    organizationId,
    audienceId,
    title: "Feedback",
    type: "survey",
    questions: [
      { key: "q1", prompt: "Happy?", type: "single_choice", options: ["y", "n"], required: true },
    ],
  });
  return open ? openSurvey(s, "2026-07-01T00:00:00.000Z") : s;
};

const setup = async (open = true) => {
  const repository = new InMemorySurveyResponseRepository();
  const surveys = new InMemorySurveyRepository();
  const events: DomainEvent[] = [];
  const survey = buildSurvey(open);
  await surveys.save(survey);
  const service = new SurveyResponseService({
    repository,
    surveys,
    persons,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, surveys, service, survey, events };
};

describe("SurveyResponseService", () => {
  it("submits an identified response to an open survey and counts it", async () => {
    const { service, survey, events } = await setup();
    const r = await service.submit({
      tenantId,
      surveyId: survey.id,
      respondentPersonId: respondent,
      answers: [{ questionKey: "q1", values: ["y"] }],
      submittedAt: "2026-07-02T09:00:00.000Z",
    });
    expect(r.organizationId).toBe(organizationId);
    expect(events.map((e) => e.type)).toContain("engagement.survey_response.submitted");
    expect(await service.countForSurvey(tenantId, survey.id)).toBe(1);
  });

  it("rejects a closed survey, an unknown question, and a duplicate identified response", async () => {
    const { service: closed, survey: cs } = await setup(false);
    await expect(
      closed.submit({
        tenantId,
        surveyId: cs.id,
        answers: [{ questionKey: "q1", values: ["y"] }],
        submittedAt: "t",
      }),
    ).rejects.toThrow(/not open/);

    const { service, survey } = await setup();
    await expect(
      service.submit({
        tenantId,
        surveyId: survey.id,
        answers: [{ questionKey: "ghost", values: ["x"] }],
        submittedAt: "t",
      }),
    ).rejects.toThrow(/unknown question/);

    await service.submit({
      tenantId,
      surveyId: survey.id,
      respondentPersonId: respondent,
      answers: [{ questionKey: "q1", values: ["y"] }],
      submittedAt: "t1",
    });
    await expect(
      service.submit({
        tenantId,
        surveyId: survey.id,
        respondentPersonId: respondent,
        answers: [{ questionKey: "q1", values: ["n"] }],
        submittedAt: "t2",
      }),
    ).rejects.toThrow(/already responded/);
  });

  it("rejects a single-choice answer with multiple distinct values, but de-duplicates repeats", async () => {
    const { service, survey } = await setup();
    await expect(
      service.submit({
        tenantId,
        surveyId: survey.id,
        answers: [{ questionKey: "q1", values: ["y", "n"] }],
        submittedAt: "t",
      }),
    ).rejects.toThrow(/single value/);
    // repeated values of the same option collapse to one (allowed) and are stored de-duplicated
    const r = await service.submit({
      tenantId,
      surveyId: survey.id,
      answers: [{ questionKey: "q1", values: ["y", "y"] }],
      submittedAt: "t",
    });
    expect(r.answers[0]?.values).toEqual(["y"]);
  });

  it("allows multiple anonymous responses (no respondent, no dedup)", async () => {
    const { service, survey } = await setup();
    await service.submit({
      tenantId,
      surveyId: survey.id,
      answers: [{ questionKey: "q1", values: ["y"] }],
      submittedAt: "t1",
    });
    await service.submit({
      tenantId,
      surveyId: survey.id,
      answers: [{ questionKey: "q1", values: ["n"] }],
      submittedAt: "t2",
    });
    expect(await service.countForSurvey(tenantId, survey.id)).toBe(2);
  });
});
