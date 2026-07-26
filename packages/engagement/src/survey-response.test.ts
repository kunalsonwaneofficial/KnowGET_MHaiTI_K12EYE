import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { recordSurveyResponse } from "./survey-response";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const surveyId = "99999999-9999-9999-9999-999999999999" as Uuid;

describe("SurveyResponse", () => {
  it("records an immutable response, normalizing answers and defaulting an anonymous respondent", () => {
    const r = recordSurveyResponse({
      tenantId,
      organizationId,
      surveyId,
      answers: [
        { questionKey: " q1 ", values: [" yes ", ""] },
        { questionKey: "q2", values: [] },
      ],
      submittedAt: "2026-07-02T10:00:00.000Z",
    });
    expect(r.respondentPersonId).toBeNull();
    // q1 keeps its single non-blank value; q2 (no values) is dropped
    expect(r.answers).toEqual([{ questionKey: "q1", values: ["yes"] }]);
  });

  it("keeps an identified respondent", () => {
    const person = "77777777-7777-7777-7777-777777777777" as Uuid;
    const r = recordSurveyResponse({
      tenantId,
      organizationId,
      surveyId,
      respondentPersonId: person,
      answers: [{ questionKey: "q1", values: ["no"] }],
      submittedAt: "t",
    });
    expect(r.respondentPersonId).toBe(person);
  });
});
