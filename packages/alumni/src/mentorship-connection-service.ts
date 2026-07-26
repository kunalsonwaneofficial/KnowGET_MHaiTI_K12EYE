import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  activateMentorship,
  completeMentorship,
  endMentorship,
  type MentorshipConnection,
  proposeMentorship,
} from "./mentorship-connection";
import {
  mentorshipActivated,
  mentorshipCompleted,
  mentorshipEnded,
  mentorshipProposed,
} from "./alumni-events";
import { AlumniProfileNotFoundError, MentorshipNotFoundError, SelfMentorshipError } from "./errors";
import type { AlumniProfileRepository, MentorshipConnectionRepository } from "./ports";

export interface ProposeMentorshipInput {
  readonly tenantId: TenantId;
  readonly mentorProfileId: Uuid;
  readonly menteeProfileId: Uuid;
  readonly proposedOn: string;
  readonly focus?: string | null;
}

export interface MentorshipConnectionServiceDeps {
  readonly repository: MentorshipConnectionRepository;
  readonly profiles: AlumniProfileRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for mentorship connections. Proposes a mentorship between two distinct alumni profiles
 * (validating both, deriving the organization from the mentor's profile), and drives
 * `proposed → active → completed | ended`, publishing the mentorship events.
 */
export class MentorshipConnectionService {
  private readonly repository: MentorshipConnectionRepository;
  private readonly profiles: AlumniProfileRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: MentorshipConnectionServiceDeps) {
    this.repository = deps.repository;
    this.profiles = deps.profiles;
    this.events = deps.events;
  }

  async propose(input: ProposeMentorshipInput): Promise<MentorshipConnection> {
    if (input.mentorProfileId === input.menteeProfileId) {
      throw new SelfMentorshipError(input.mentorProfileId);
    }
    const mentor = await this.profiles.findById(input.tenantId, input.mentorProfileId);
    if (!mentor) {
      throw new AlumniProfileNotFoundError(input.mentorProfileId);
    }
    if (!(await this.profiles.findById(input.tenantId, input.menteeProfileId))) {
      throw new AlumniProfileNotFoundError(input.menteeProfileId);
    }
    const connection = proposeMentorship({
      tenantId: input.tenantId,
      organizationId: mentor.organizationId,
      mentorProfileId: input.mentorProfileId,
      menteeProfileId: input.menteeProfileId,
      proposedOn: input.proposedOn,
      focus: input.focus ?? null,
    });
    await this.repository.save(connection);
    await this.emit(mentorshipProposed(connection));
    return connection;
  }

  async activate(tenantId: TenantId, id: Uuid, startedOn: string): Promise<MentorshipConnection> {
    const updated = activateMentorship(await this.require(tenantId, id), startedOn);
    await this.repository.save(updated);
    await this.emit(mentorshipActivated(updated));
    return updated;
  }

  async complete(tenantId: TenantId, id: Uuid, endedOn: string): Promise<MentorshipConnection> {
    const updated = completeMentorship(await this.require(tenantId, id), endedOn);
    await this.repository.save(updated);
    await this.emit(mentorshipCompleted(updated));
    return updated;
  }

  async end(tenantId: TenantId, id: Uuid, endedOn: string): Promise<MentorshipConnection> {
    const updated = endMentorship(await this.require(tenantId, id), endedOn);
    await this.repository.save(updated);
    await this.emit(mentorshipEnded(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<MentorshipConnection> {
    return this.require(tenantId, id);
  }

  async listForAlumnus(tenantId: TenantId, alumniProfileId: Uuid): Promise<MentorshipConnection[]> {
    return this.repository.listByAlumnus(tenantId, alumniProfileId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<MentorshipConnection> {
    const connection = await this.repository.findById(tenantId, id);
    if (!connection) {
      throw new MentorshipNotFoundError(id);
    }
    return connection;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
