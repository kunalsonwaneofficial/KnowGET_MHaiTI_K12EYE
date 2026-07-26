import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import type { SurveyAnswerView } from "./engagement-view";
import { isSurveyOpen } from "./survey";
import { recordSurveyResponse, type SurveyResponse } from "./survey-response";
import { surveyResponseSubmitted } from "./engagement-events";
import {
  DuplicateSurveyResponseError,
  PersonNotFoundForEngagementError,
  SurveyNotFoundError,
  SurveyNotOpenError,
  UnknownSurveyQuestionError,
} from "./errors";
import type { PersonDirectory, SurveyRepository, SurveyResponseRepository } from "./ports";

export interface SubmitSurveyResponseInput {
  readonly tenantId: TenantId;
  readonly surveyId: Uuid;
  readonly respondentPersonId?: Uuid | null;
  readonly answers: readonly SurveyAnswerView[];
  readonly submittedAt: string;
}

export interface SurveyResponseServiceDeps {
  readonly repository: SurveyResponseRepository;
  readonly surveys: SurveyRepository;
  readonly persons: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for survey responses — the append-only submission log behind a survey's response rate.
 * Submits a response (validating the survey is open, that every answer references a question the survey
 * defines, and — for an identified respondent — that the person exists and has not already responded),
 * deriving the organization from the survey, and publishes the response event. Responses are immutable, so
 * there is no update or delete.
 */
export class SurveyResponseService {
  private readonly repository: SurveyResponseRepository;
  private readonly surveys: SurveyRepository;
  private readonly persons: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: SurveyResponseServiceDeps) {
    this.repository = deps.repository;
    this.surveys = deps.surveys;
    this.persons = deps.persons;
    this.events = deps.events;
  }

  async submit(input: SubmitSurveyResponseInput): Promise<SurveyResponse> {
    const survey = await this.surveys.findById(input.tenantId, input.surveyId);
    if (!survey) {
      throw new SurveyNotFoundError(input.surveyId);
    }
    if (!isSurveyOpen(survey)) {
      throw new SurveyNotOpenError(input.surveyId);
    }
    const questionKeys = new Set(survey.questions.map((q) => q.key));
    for (const answer of input.answers) {
      const key = answer.questionKey.trim();
      if (!questionKeys.has(key)) {
        throw new UnknownSurveyQuestionError(key);
      }
    }
    const respondentPersonId = input.respondentPersonId ?? null;
    if (respondentPersonId !== null) {
      if (!(await this.persons.exists(input.tenantId, respondentPersonId))) {
        throw new PersonNotFoundForEngagementError(respondentPersonId);
      }
      if (
        await this.repository.findBySurveyAndRespondent(
          input.tenantId,
          input.surveyId,
          respondentPersonId,
        )
      ) {
        throw new DuplicateSurveyResponseError(input.surveyId, respondentPersonId);
      }
    }
    const response = recordSurveyResponse({
      tenantId: input.tenantId,
      organizationId: survey.organizationId,
      surveyId: input.surveyId,
      respondentPersonId,
      answers: input.answers,
      submittedAt: input.submittedAt,
    });
    await this.repository.save(response);
    await this.emit(surveyResponseSubmitted(response));
    return response;
  }

  async listForSurvey(tenantId: TenantId, surveyId: Uuid): Promise<SurveyResponse[]> {
    return this.repository.listBySurvey(tenantId, surveyId);
  }

  async countForSurvey(tenantId: TenantId, surveyId: Uuid): Promise<number> {
    return this.repository.countBySurvey(tenantId, surveyId);
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
