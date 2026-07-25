import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { participationRecorded } from "./attendance-presence-events";
import {
  AttendanceSessionNotFoundError,
  OrganizationNotFoundForAttendanceError,
  ParticipantNotFoundForAttendanceError,
  ParticipationNotFoundError,
} from "./errors";
import {
  amendParticipationRemarks,
  createParticipation,
  type Participation,
  setEngagementLevel,
} from "./participation";
import type { ActivityType, EngagementLevel } from "./participation-type";
import type {
  AttendanceSessionRepository,
  OrganizationDirectory,
  ParticipantDirectory,
  ParticipationRepository,
} from "./ports";

export interface ParticipationServiceDeps {
  readonly repository: ParticipationRepository;
  readonly organizations: OrganizationDirectory;
  readonly participants: ParticipantDirectory;
  readonly sessions?: AttendanceSessionRepository;
  readonly events?: Pick<EventBus, "publish">;
}

export interface RecordParticipationInput {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly participantId: Uuid;
  readonly activityType: ActivityType;
  readonly activityName: string;
  readonly date: string;
  readonly sessionId?: Uuid | null;
  readonly role?: string | null;
  readonly engagementLevel?: EngagementLevel | null;
  readonly remarks?: string | null;
}

/**
 * Application service for co-curricular participation. Records a validated participant's
 * involvement in an activity against a validated Organization (optionally linked to an
 * attendance session), broadening attendance into institutional engagement. Publishes
 * {@link participationRecorded}; the presence profile consumes participation for its
 * engagement and diversity signals.
 */
export class ParticipationService {
  private readonly repository: ParticipationRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly participants: ParticipantDirectory;
  private readonly sessions: AttendanceSessionRepository | undefined;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: ParticipationServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.participants = deps.participants;
    this.sessions = deps.sessions;
    this.events = deps.events;
  }

  async record(input: RecordParticipationInput): Promise<Participation> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForAttendanceError(input.organizationId);
    }
    if (!(await this.participants.exists(input.tenantId, input.participantId))) {
      throw new ParticipantNotFoundForAttendanceError(input.participantId);
    }
    if (input.sessionId && this.sessions) {
      if (!(await this.sessions.findById(input.tenantId, input.sessionId))) {
        throw new AttendanceSessionNotFoundError(input.sessionId);
      }
    }
    const participation = createParticipation(input);
    await this.repository.save(participation);
    await this.emit(participationRecorded(participation));
    return participation;
  }

  async setEngagement(
    tenantId: TenantId,
    id: Uuid,
    engagementLevel: EngagementLevel | null,
  ): Promise<Participation> {
    return this.mutate(tenantId, id, (p) => setEngagementLevel(p, engagementLevel));
  }

  async amendRemarks(tenantId: TenantId, id: Uuid, remarks: string | null): Promise<Participation> {
    return this.mutate(tenantId, id, (p) => amendParticipationRemarks(p, remarks));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Participation> {
    return this.require(tenantId, id);
  }

  async listForParticipant(tenantId: TenantId, participantId: Uuid): Promise<Participation[]> {
    return this.repository.listByParticipant(tenantId, participantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Participation[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (participation: Participation) => Participation,
  ): Promise<Participation> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Participation> {
    const participation = await this.repository.findById(tenantId, id);
    if (!participation) {
      throw new ParticipationNotFoundError(id);
    }
    return participation;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
