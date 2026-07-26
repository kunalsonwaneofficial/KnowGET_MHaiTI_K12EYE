import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { SurveyAnswerView } from "./engagement-view";

/**
 * A survey response — an immutable, append-only submission to a survey: an optional respondent Person (null
 * for an anonymous response), the set of answers, and the moment. It has no lifecycle and no edit or delete
 * path — a submission is a fact. Its `answers` structurally satisfy the tally engine's response view, so a
 * survey's responses roll up into the per-question distribution; the service validates answers against the
 * survey's questions and enforces one identified response per (survey, respondent).
 */
export interface SurveyResponse {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly surveyId: Uuid;
  readonly respondentPersonId: Uuid | null;
  readonly answers: readonly SurveyAnswerView[];
  readonly submittedAt: string;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RecordSurveyResponseParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly surveyId: Uuid;
  readonly respondentPersonId?: Uuid | null;
  readonly answers: readonly SurveyAnswerView[];
  readonly submittedAt: string;
}

/** Normalize answers — trim values, drop blanks, and drop answers left with no values. */
const normalizeAnswers = (answers: readonly SurveyAnswerView[]): SurveyAnswerView[] =>
  answers
    .map((a) => ({
      questionKey: a.questionKey.trim(),
      values: a.values.map((v) => v.trim()).filter((v) => v.length > 0),
    }))
    .filter((a) => a.questionKey.length > 0 && a.values.length > 0);

/**
 * Record a survey response. Immutable: there is no update path — a re-submission is a new decision by the
 * service (which enforces one identified response per survey/respondent), never an edit.
 */
export function recordSurveyResponse(params: RecordSurveyResponseParams): SurveyResponse {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    surveyId: params.surveyId,
    respondentPersonId: params.respondentPersonId ?? null,
    answers: normalizeAnswers(params.answers),
    submittedAt: params.submittedAt,
    createdAt: now,
    updatedAt: now,
  };
}
