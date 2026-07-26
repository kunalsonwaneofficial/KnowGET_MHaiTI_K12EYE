import { describe, expect, it } from "vitest";
import { computeResponseRate, tallySurveyResponses } from "./survey-tally";
import type { SurveyQuestionView, SurveyResponseView } from "./engagement-view";

const questions: SurveyQuestionView[] = [
  { key: "q1", type: "single_choice", options: ["yes", "no"] },
  { key: "q2", type: "rating", options: ["1", "2", "3", "4", "5"] },
  { key: "q3", type: "text", options: [] },
];

describe("tallySurveyResponses", () => {
  it("counts answered responses and per-option distributions for choice questions", () => {
    const responses: SurveyResponseView[] = [
      {
        answers: [
          { questionKey: "q1", values: ["yes"] },
          { questionKey: "q2", values: ["5"] },
          { questionKey: "q3", values: ["great"] },
        ],
      },
      {
        answers: [
          { questionKey: "q1", values: ["no"] },
          { questionKey: "q2", values: ["5"] },
        ],
      },
      {
        answers: [{ questionKey: "q1", values: ["yes"] }],
      },
    ];
    const tally = tallySurveyResponses(questions, responses);
    expect(tally.totalResponses).toBe(3);

    const q1 = tally.questions.find((q) => q.questionKey === "q1");
    expect(q1?.answeredCount).toBe(3);
    expect(q1?.options).toEqual([
      { value: "yes", count: 2 },
      { value: "no", count: 1 },
    ]);

    const q2 = tally.questions.find((q) => q.questionKey === "q2");
    expect(q2?.answeredCount).toBe(2);
    expect(q2?.options.find((o) => o.value === "5")?.count).toBe(2);
    expect(q2?.options.find((o) => o.value === "1")?.count).toBe(0);

    // a text question is answered but carries no option tally
    const q3 = tally.questions.find((q) => q.questionKey === "q3");
    expect(q3?.answeredCount).toBe(1);
    expect(q3?.options).toEqual([]);
  });

  it("ignores values not among the declared options but still counts the response as answered", () => {
    const responses: SurveyResponseView[] = [
      { answers: [{ questionKey: "q1", values: ["maybe"] }] },
    ];
    const tally = tallySurveyResponses(questions, responses);
    const q1 = tally.questions.find((q) => q.questionKey === "q1");
    expect(q1?.answeredCount).toBe(1);
    expect(q1?.options).toEqual([
      { value: "yes", count: 0 },
      { value: "no", count: 0 },
    ]);
  });

  it("tallies a multi-choice question across all selected values", () => {
    const q: SurveyQuestionView[] = [{ key: "m", type: "multi_choice", options: ["a", "b", "c"] }];
    const responses: SurveyResponseView[] = [
      { answers: [{ questionKey: "m", values: ["a", "b"] }] },
      { answers: [{ questionKey: "m", values: ["b", "c"] }] },
    ];
    const tally = tallySurveyResponses(q, responses);
    expect(tally.questions[0]?.options).toEqual([
      { value: "a", count: 1 },
      { value: "b", count: 2 },
      { value: "c", count: 1 },
    ]);
  });

  it("is empty-safe (no responses ⇒ zero counts, options seeded at 0)", () => {
    const tally = tallySurveyResponses(questions, []);
    expect(tally.totalResponses).toBe(0);
    expect(tally.questions.find((q) => q.questionKey === "q1")?.options).toEqual([
      { value: "yes", count: 0 },
      { value: "no", count: 0 },
    ]);
  });
});

describe("computeResponseRate", () => {
  it("values responded, pending and a response percent", () => {
    expect(computeResponseRate(50, 20)).toEqual({
      audienceSize: 50,
      responseCount: 20,
      pendingCount: 30,
      responsePercent: 40,
    });
  });

  it("is empty-safe and capped (no over-100, no negative pending)", () => {
    expect(computeResponseRate(0, 0)).toEqual({
      audienceSize: 0,
      responseCount: 0,
      pendingCount: 0,
      responsePercent: 0,
    });
    const rate = computeResponseRate(10, 15);
    expect(rate.pendingCount).toBe(0);
    expect(rate.responsePercent).toBe(100);
  });
});
