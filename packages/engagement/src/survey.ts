import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptySurveyTitleError,
  InvalidSurveyQuestionsError,
  InvalidSurveyTransitionError,
} from "./errors";
import { CHOICE_QUESTION_TYPES, type QuestionType, type SurveyType } from "./engagement-value";
import type { SurveyQuestionView } from "./engagement-view";

/**
 * A survey question — a keyed prompt of a given type. The closed-form choice types (single_choice,
 * multi_choice, rating) carry at least two options; a text question carries none. Held on the survey as a
 * versioned, editable-while-draft list stored as JSONB.
 */
export interface SurveyQuestion {
  readonly key: string;
  readonly prompt: string;
  readonly type: QuestionType;
  readonly options: readonly string[];
  readonly required: boolean;
}

/**
 * A survey — a feedback / poll / consent-check instrument targeting an audience, carrying an ordered set of
 * questions. It runs `draft → open → closed → archived`; questions and title are editable only while draft
 * (an opened survey is frozen), responses are accepted only while open, and archived is terminal. The tally
 * engine reads its questions and the collected responses; the audience size drives the response rate.
 */
export interface Survey {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly audienceId: Uuid;
  readonly title: string;
  readonly type: SurveyType;
  readonly questions: readonly SurveyQuestion[];
  readonly status: "draft" | "open" | "closed" | "archived";
  readonly opensAt: string | null;
  readonly closesAt: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateSurveyParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly audienceId: Uuid;
  readonly title: string;
  readonly type: SurveyType;
  readonly questions: readonly SurveyQuestion[];
}

const isChoiceType = (type: QuestionType): boolean =>
  (CHOICE_QUESTION_TYPES as readonly string[]).includes(type);

/** Validate + normalize a survey's questions: non-empty set, unique non-blank keys/prompts, choice options. */
function normalizeQuestions(questions: readonly SurveyQuestion[]): SurveyQuestion[] {
  if (questions.length === 0) {
    throw new InvalidSurveyQuestionsError("a survey must have at least one question");
  }
  const seen = new Set<string>();
  return questions.map((q) => {
    const key = q.key.trim();
    if (key.length === 0) {
      throw new InvalidSurveyQuestionsError("every question must have a non-empty key");
    }
    if (seen.has(key)) {
      throw new InvalidSurveyQuestionsError(`duplicate question key "${key}"`);
    }
    seen.add(key);
    const prompt = q.prompt.trim();
    if (prompt.length === 0) {
      throw new InvalidSurveyQuestionsError(`question "${key}" must have a non-empty prompt`);
    }
    if (isChoiceType(q.type)) {
      const options = q.options.map((o) => o.trim()).filter((o) => o.length > 0);
      if (new Set(options).size !== options.length) {
        throw new InvalidSurveyQuestionsError(`question "${key}" has duplicate options`);
      }
      if (options.length < 2) {
        throw new InvalidSurveyQuestionsError(
          `choice question "${key}" must have at least two options`,
        );
      }
      return { key, prompt, type: q.type, options, required: q.required };
    }
    return { key, prompt, type: q.type, options: [], required: q.required };
  });
}

/** Create a survey (status `draft`). Title required; questions validated + normalized. */
export function createSurvey(params: CreateSurveyParams): Survey {
  const title = params.title.trim();
  if (title.length === 0) {
    throw new EmptySurveyTitleError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    audienceId: params.audienceId,
    title,
    type: params.type,
    questions: normalizeQuestions(params.questions),
    status: "draft",
    opensAt: null,
    closesAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (survey: Survey, patch: Partial<Survey>): Survey => ({
  ...survey,
  ...patch,
  updatedAt: nowIso(),
});

/** Rename a survey's title; only while draft. */
export function setSurveyTitle(survey: Survey, title: string): Survey {
  if (survey.status !== "draft") {
    throw new InvalidSurveyTransitionError(survey.status, "title-set");
  }
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    throw new EmptySurveyTitleError();
  }
  return touch(survey, { title: trimmed });
}

/** Replace a survey's questions; only while draft. */
export function editSurveyQuestions(survey: Survey, questions: readonly SurveyQuestion[]): Survey {
  if (survey.status !== "draft") {
    throw new InvalidSurveyTransitionError(survey.status, "questions-edited");
  }
  return touch(survey, { questions: normalizeQuestions(questions) });
}

/** Open a survey for responses (`draft → open`), stamping the open time. */
export function openSurvey(survey: Survey, opensAt: string): Survey {
  if (survey.status !== "draft") {
    throw new InvalidSurveyTransitionError(survey.status, "open");
  }
  return touch(survey, { status: "open", opensAt });
}

/** Close a survey to further responses (`open → closed`), stamping the close time. */
export function closeSurvey(survey: Survey, closesAt: string): Survey {
  if (survey.status !== "open") {
    throw new InvalidSurveyTransitionError(survey.status, "closed");
  }
  return touch(survey, { status: "closed", closesAt });
}

/** Archive a survey (→ `archived`, terminal). */
export function archiveSurvey(survey: Survey): Survey {
  if (survey.status === "archived") {
    throw new InvalidSurveyTransitionError(survey.status, "archived");
  }
  return touch(survey, { status: "archived" });
}

/** Whether the survey is open (accepting responses). */
export const isSurveyOpen = (survey: Survey): boolean => survey.status === "open";

/** The narrow question views the tally engine consumes. */
export const surveyQuestionViews = (survey: Survey): SurveyQuestionView[] =>
  survey.questions.map((q) => ({ key: q.key, type: q.type, options: q.options }));
