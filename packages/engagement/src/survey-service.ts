import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { isAudienceActive } from "./audience";
import {
  archiveSurvey,
  closeSurvey,
  type CreateSurveyParams,
  createSurvey,
  editSurveyQuestions,
  openSurvey,
  setSurveyTitle,
  type Survey,
  type SurveyQuestion,
} from "./survey";
import {
  surveyArchived,
  surveyClosed,
  surveyCreated,
  surveyOpened,
  surveyQuestionsEdited,
  surveyTitleSet,
} from "./engagement-events";
import {
  AudienceNotActiveError,
  AudienceNotFoundError,
  OrganizationNotFoundForEngagementError,
  SurveyNotFoundError,
} from "./errors";
import type { AudienceRepository, OrganizationDirectory, SurveyRepository } from "./ports";

/** The create input — the organization is derived from the target audience, not supplied. */
export type CreateSurveyInput = Omit<CreateSurveyParams, "organizationId">;

export interface SurveyServiceDeps {
  readonly repository: SurveyRepository;
  readonly audiences: AudienceRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for surveys — the feedback / poll instruments. Creates a survey (validating an active
 * target audience and deriving the organization from it, with its questions validated), edits its questions
 * and title while draft, and drives `draft → open → closed → archived`, publishing the survey events.
 * Responses are submitted through the survey-response service against an open survey.
 */
export class SurveyService {
  private readonly repository: SurveyRepository;
  private readonly audiences: AudienceRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: SurveyServiceDeps) {
    this.repository = deps.repository;
    this.audiences = deps.audiences;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async create(input: CreateSurveyInput): Promise<Survey> {
    const audience = await this.audiences.findById(input.tenantId, input.audienceId);
    if (!audience) {
      throw new AudienceNotFoundError(input.audienceId);
    }
    if (!isAudienceActive(audience)) {
      throw new AudienceNotActiveError(input.audienceId);
    }
    if (!(await this.organizations.exists(input.tenantId, audience.organizationId))) {
      throw new OrganizationNotFoundForEngagementError(audience.organizationId);
    }
    const survey = createSurvey({ ...input, organizationId: audience.organizationId });
    await this.repository.save(survey);
    await this.emit(surveyCreated(survey));
    return survey;
  }

  async editQuestions(
    tenantId: TenantId,
    id: Uuid,
    questions: readonly SurveyQuestion[],
  ): Promise<Survey> {
    const updated = editSurveyQuestions(await this.require(tenantId, id), questions);
    await this.repository.save(updated);
    await this.emit(surveyQuestionsEdited(updated));
    return updated;
  }

  async setTitle(tenantId: TenantId, id: Uuid, title: string): Promise<Survey> {
    const updated = setSurveyTitle(await this.require(tenantId, id), title);
    await this.repository.save(updated);
    await this.emit(surveyTitleSet(updated));
    return updated;
  }

  async open(tenantId: TenantId, id: Uuid, opensAt: string): Promise<Survey> {
    const updated = openSurvey(await this.require(tenantId, id), opensAt);
    await this.repository.save(updated);
    await this.emit(surveyOpened(updated));
    return updated;
  }

  async close(tenantId: TenantId, id: Uuid, closesAt: string): Promise<Survey> {
    const updated = closeSurvey(await this.require(tenantId, id), closesAt);
    await this.repository.save(updated);
    await this.emit(surveyClosed(updated));
    return updated;
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<Survey> {
    const updated = archiveSurvey(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(surveyArchived(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Survey> {
    return this.require(tenantId, id);
  }

  async listForAudience(tenantId: TenantId, audienceId: Uuid): Promise<Survey[]> {
    return this.repository.listByAudience(tenantId, audienceId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Survey[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Survey> {
    const survey = await this.repository.findById(tenantId, id);
    if (!survey) {
      throw new SurveyNotFoundError(id);
    }
    return survey;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
