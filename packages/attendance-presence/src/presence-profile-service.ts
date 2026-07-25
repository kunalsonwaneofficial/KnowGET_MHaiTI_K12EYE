import type { TenantId, Uuid } from "@knowget/types";
import {
  OrganizationNotFoundForAttendanceError,
  ParticipantNotFoundForAttendanceError,
  PresenceProfileNotFoundError,
} from "./errors";
import type {
  OrganizationDirectory,
  ParticipantDirectory,
  PresenceProfileRepository,
} from "./ports";
import { applyIndicators, createPresenceProfile, type PresenceProfile } from "./presence-profile";
import type { PresenceIndicators } from "./presence-intelligence";

export interface PresenceProfileServiceDeps {
  readonly repository: PresenceProfileRepository;
  readonly organizations: OrganizationDirectory;
  readonly participants: ParticipantDirectory;
}

/**
 * Application service for presence profiles. Ensures a validated participant has exactly one
 * profile per organization, and applies freshly-computed indicator snapshots (produced by
 * the presence-intelligence engine — see the presence service that orchestrates the
 * recompute). Read model for AI-ready presence signals; no domain event of its own.
 */
export class PresenceProfileService {
  private readonly repository: PresenceProfileRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly participants: ParticipantDirectory;

  constructor(deps: PresenceProfileServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.participants = deps.participants;
  }

  /** Get the participant's profile, creating an empty one if none exists yet. */
  async ensure(
    tenantId: TenantId,
    organizationId: Uuid,
    participantId: Uuid,
  ): Promise<PresenceProfile> {
    const existing = await this.repository.findByParticipant(tenantId, participantId);
    if (existing) {
      return existing;
    }
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForAttendanceError(organizationId);
    }
    if (!(await this.participants.exists(tenantId, participantId))) {
      throw new ParticipantNotFoundForAttendanceError(participantId);
    }
    const profile = createPresenceProfile({ tenantId, organizationId, participantId });
    await this.repository.save(profile);
    return profile;
  }

  /** Apply a computed indicator snapshot to an existing profile. */
  async apply(
    tenantId: TenantId,
    participantId: Uuid,
    indicators: PresenceIndicators,
  ): Promise<PresenceProfile> {
    const profile = await this.repository.findByParticipant(tenantId, participantId);
    if (!profile) {
      throw new PresenceProfileNotFoundError(participantId);
    }
    const updated = applyIndicators(profile, indicators);
    await this.repository.save(updated);
    return updated;
  }

  async getByParticipant(tenantId: TenantId, participantId: Uuid): Promise<PresenceProfile | null> {
    return this.repository.findByParticipant(tenantId, participantId);
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<PresenceProfile> {
    const profile = await this.repository.findById(tenantId, id);
    if (!profile) {
      throw new PresenceProfileNotFoundError(id);
    }
    return profile;
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<PresenceProfile[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }
}
