import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { isEngagementRunning } from "./coaching-engagement";
import {
  type AmendSessionParams,
  amendSession,
  type CoachingSession,
  type LogSessionParams,
  logSession,
} from "./coaching-session";
import {
  CoachingEngagementNotFoundError,
  CoachingSessionNotFoundError,
  EngagementNotActiveError,
} from "./errors";
import { sessionLogged } from "./faculty-events";
import type { CoachingEngagementRepository, CoachingSessionRepository } from "./ports";

/** The service log input — the organization is derived from the engagement, not supplied. */
export type LogSessionInput = Omit<LogSessionParams, "organizationId">;

export interface CoachingSessionServiceDeps {
  readonly repository: CoachingSessionRepository;
  readonly engagements: CoachingEngagementRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for coaching sessions — the session log within a coaching engagement. Logs a
 * session against an **active** engagement (deriving the organization from it), lets a session be
 * amended, and publishes the session-logged event.
 */
export class CoachingSessionService {
  private readonly repository: CoachingSessionRepository;
  private readonly engagements: CoachingEngagementRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: CoachingSessionServiceDeps) {
    this.repository = deps.repository;
    this.engagements = deps.engagements;
    this.events = deps.events;
  }

  async log(input: LogSessionInput): Promise<CoachingSession> {
    const engagement = await this.engagements.findById(input.tenantId, input.engagementId);
    if (!engagement) {
      throw new CoachingEngagementNotFoundError(input.engagementId);
    }
    if (!isEngagementRunning(engagement)) {
      throw new EngagementNotActiveError(engagement.id);
    }
    const session = logSession({ ...input, organizationId: engagement.organizationId });
    await this.repository.save(session);
    await this.emit(sessionLogged(session));
    return session;
  }

  async amend(tenantId: TenantId, id: Uuid, params: AmendSessionParams): Promise<CoachingSession> {
    const updated = amendSession(await this.require(tenantId, id), params);
    await this.repository.save(updated);
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<CoachingSession> {
    return this.require(tenantId, id);
  }

  async listForEngagement(tenantId: TenantId, engagementId: Uuid): Promise<CoachingSession[]> {
    return this.repository.listByEngagement(tenantId, engagementId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<CoachingSession> {
    const session = await this.repository.findById(tenantId, id);
    if (!session) {
      throw new CoachingSessionNotFoundError(id);
    }
    return session;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
