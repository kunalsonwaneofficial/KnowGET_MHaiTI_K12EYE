import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  archiveSurvey,
  closeSurvey,
  createSurvey,
  editSurveyQuestions,
  isSurveyOpen,
  openSurvey,
  type SurveyQuestion,
  surveyQuestionViews,
} from "./survey";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const audienceId = "44444444-4444-4444-4444-444444444444" as Uuid;

const questions: SurveyQuestion[] = [
  { key: "q1", prompt: "Happy?", type: "single_choice", options: ["yes", "no"], required: true },
  { key: "q2", prompt: "Comments", type: "text", options: [], required: false },
];

const make = () =>
  createSurvey({
    tenantId,
    organizationId,
    audienceId,
    title: "Term feedback",
    type: "survey",
    questions,
  });

describe("Survey", () => {
  it("creates a draft, normalizing questions and exposing tally views", () => {
    const s = make();
    expect(s.status).toBe("draft");
    expect(s.questions).toHaveLength(2);
    expect(surveyQuestionViews(s)).toEqual([
      { key: "q1", type: "single_choice", options: ["yes", "no"] },
      { key: "q2", type: "text", options: [] },
    ]);
  });

  it("rejects invalid questions (empty set, duplicate key, too few options)", () => {
    expect(() =>
      createSurvey({
        tenantId,
        organizationId,
        audienceId,
        title: "x",
        type: "poll",
        questions: [],
      }),
    ).toThrow(/at least one question/);
    expect(() =>
      createSurvey({
        tenantId,
        organizationId,
        audienceId,
        title: "x",
        type: "poll",
        questions: [
          { key: "q1", prompt: "a", type: "text", options: [], required: false },
          { key: "q1", prompt: "b", type: "text", options: [], required: false },
        ],
      }),
    ).toThrow(/duplicate question key/);
    expect(() =>
      createSurvey({
        tenantId,
        organizationId,
        audienceId,
        title: "x",
        type: "poll",
        questions: [
          { key: "q1", prompt: "a", type: "single_choice", options: ["only"], required: false },
        ],
      }),
    ).toThrow(/at least two options/);
  });

  it("runs draft → open → closed → archived and freezes questions once open", () => {
    let s = openSurvey(make(), "2026-07-01T00:00:00.000Z");
    expect(isSurveyOpen(s)).toBe(true);
    expect(() => editSurveyQuestions(s, questions)).toThrow(/cannot move/);
    s = closeSurvey(s, "2026-07-08T00:00:00.000Z");
    expect(s.status).toBe("closed");
    s = archiveSurvey(s);
    expect(s.status).toBe("archived");
  });
});
