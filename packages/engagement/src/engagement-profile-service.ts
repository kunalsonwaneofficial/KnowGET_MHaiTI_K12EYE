import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { audienceSize as audienceSizeOf } from "./audience";
import { summarizeEngagement } from "./engagement";
import {
  composeEngagementProfile,
  type EngagementProfile,
  refreshEngagementProfile,
} from "./engagement-profile";
import type { AnnouncementReachView } from "./engagement-view";
import { engagementProfileRefreshed } from "./engagement-events";
import { AudienceNotFoundError } from "./errors";
import { computeResponseRate } from "./survey-tally";
import type {
  AcknowledgementRepository,
  AnnouncementRepository,
  AudienceRepository,
  EngagementProfileRepository,
  SurveyRepository,
  SurveyResponseRepository,
} from "./ports";

export interface EngagementProfileServiceDeps {
  readonly repository: EngagementProfileRepository;
  readonly audiences: AudienceRepository;
  readonly announcements: AnnouncementRepository;
  readonly acknowledgements: AcknowledgementRepository;
  readonly surveys: SurveyRepository;
  readonly responses: SurveyResponseRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * The integration spine of P2-D22 — refreshes an audience's descriptive engagement profile. It resolves the
 * audience (its current size), rolls its published announcements against their acknowledgement receipts
 * through the pure engagement engine (announcement count, total acknowledged, overall acknowledgement
 * percent), rolls its surveys against their responses through the pure response-rate engine (survey count,
 * total responses, overall response percent), and composes or refreshes the one profile per audience,
 * publishing the refreshed event. Every field is derived — the profile holds no truth of its own.
 */
export class EngagementProfileService {
  private readonly repository: EngagementProfileRepository;
  private readonly audiences: AudienceRepository;
  private readonly announcements: AnnouncementRepository;
  private readonly acknowledgements: AcknowledgementRepository;
  private readonly surveys: SurveyRepository;
  private readonly responses: SurveyResponseRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: EngagementProfileServiceDeps) {
    this.repository = deps.repository;
    this.audiences = deps.audiences;
    this.announcements = deps.announcements;
    this.acknowledgements = deps.acknowledgements;
    this.surveys = deps.surveys;
    this.responses = deps.responses;
    this.events = deps.events;
  }

  async refresh(
    tenantId: TenantId,
    audienceId: Uuid,
    refreshedAt: string,
  ): Promise<EngagementProfile> {
    const audience = await this.audiences.findById(tenantId, audienceId);
    if (!audience) {
      throw new AudienceNotFoundError(audienceId);
    }
    const size = audienceSizeOf(audience);

    const published = await this.announcements.listPublishedByAudience(tenantId, audienceId);
    const reachViews: AnnouncementReachView[] = [];
    for (const announcement of published) {
      const acknowledgedCount = await this.acknowledgements.countByAnnouncement(
        tenantId,
        announcement.id,
      );
      reachViews.push({ audienceSize: size, acknowledgedCount });
    }
    const engagement = summarizeEngagement(reachViews);

    // Only surveys that have been issued (opened at some point — not still draft) can collect responses, so
    // draft surveys are excluded from the count and the rate denominator, mirroring the published-only
    // announcement roll-up above.
    const surveys = (await this.surveys.listByAudience(tenantId, audienceId)).filter(
      (survey) => survey.status !== "draft",
    );
    let totalResponses = 0;
    for (const survey of surveys) {
      totalResponses += await this.responses.countBySurvey(tenantId, survey.id);
    }
    const responseRate = computeResponseRate(size * surveys.length, totalResponses);

    const facts = {
      tenantId,
      organizationId: audience.organizationId,
      audienceId,
      audienceCode: audience.code,
      audienceName: audience.name,
      audienceSize: size,
      announcementCount: engagement.announcementCount,
      totalAcknowledged: engagement.totalAcknowledged,
      acknowledgementPercent: engagement.acknowledgementPercent,
      surveyCount: surveys.length,
      totalResponses,
      responsePercent: responseRate.responsePercent,
      refreshedAt,
    };

    const existing = await this.repository.findByAudience(tenantId, audienceId);
    const profile = existing
      ? refreshEngagementProfile(existing, facts)
      : composeEngagementProfile(facts);
    await this.repository.save(profile);
    await this.emit(engagementProfileRefreshed(profile));
    return profile;
  }

  async getByAudience(tenantId: TenantId, audienceId: Uuid): Promise<EngagementProfile | null> {
    return this.repository.findByAudience(tenantId, audienceId);
  }

  async listForOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<EngagementProfile[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
