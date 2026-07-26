import { CHOICE_QUESTION_TYPES } from "./engagement-value";
import type {
  OptionTally,
  ResponseRate,
  SurveyQuestionTally,
  SurveyQuestionView,
  SurveyResponseView,
  SurveyTally,
} from "./engagement-view";

const isChoiceType = (type: string): boolean =>
  (CHOICE_QUESTION_TYPES as readonly string[]).includes(type);

/**
 * The pure survey-tally engine — reduces a survey's questions and the submitted responses into a per-question
 * distribution: for each question, how many responses answered it, and (for the closed-form choice types) how
 * many responses selected each declared option. Values not among a question's declared options still count the
 * response as answered but are not tallied against any option. Text questions carry no option tally. Pure and
 * deterministic. Built and tested before any aggregate depends on it.
 */
export function tallySurveyResponses(
  questions: readonly SurveyQuestionView[],
  responses: readonly SurveyResponseView[],
): SurveyTally {
  const questionTallies: SurveyQuestionTally[] = questions.map((question) => {
    const counts = new Map<string, number>();
    if (isChoiceType(question.type)) {
      for (const option of question.options) {
        counts.set(option, 0);
      }
    }
    let answeredCount = 0;
    for (const response of responses) {
      const answer = response.answers.find((a) => a.questionKey === question.key);
      if (!answer || answer.values.length === 0) {
        continue;
      }
      answeredCount += 1;
      if (isChoiceType(question.type)) {
        for (const value of answer.values) {
          const current = counts.get(value);
          if (current !== undefined) {
            counts.set(value, current + 1);
          }
        }
      }
    }
    const options: OptionTally[] = [...counts.entries()].map(([value, count]) => ({
      value,
      count,
    }));
    return { questionKey: question.key, answeredCount, options };
  });
  return { totalResponses: responses.length, questions: questionTallies };
}

/**
 * The pure response-rate engine — values a survey's response rate: its audience size against the number who
 * have responded, the still-pending count (never negative) and a response percent (capped at 100; an empty
 * audience reads 0%). Pure and deterministic.
 */
export function computeResponseRate(audienceSize: number, responseCount: number): ResponseRate {
  const responded = Math.max(0, responseCount);
  const size = Math.max(0, audienceSize);
  return {
    audienceSize: size,
    responseCount: responded,
    pendingCount: Math.max(0, size - responded),
    responsePercent: size > 0 ? Math.round((Math.min(responded, size) / size) * 100) : 0,
  };
}
