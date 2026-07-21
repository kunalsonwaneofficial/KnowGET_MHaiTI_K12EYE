import type { TenantId, Uuid } from "@knowget/types";
import type { CommunicationChannel } from "./communication-channel";
import {
  clearNotificationPreference,
  type CommunicationProfile,
  createCommunicationProfile,
  putSchedule,
  removeSchedule,
  setAccessibilityRequirements,
  setNotificationPreference,
  setPreferredChannels,
  setPreferredLanguage,
} from "./communication-profile";
import type { CommunicationSchedule } from "./communication-schedule";
import {
  CommunicationProfileNotFoundError,
  DuplicateCommunicationProfileError,
  FamilyNotFoundError,
} from "./errors";
import type { Family } from "./family";
import type { NotificationLevel } from "./notification-preference";
import type { CommunicationProfileRepository, FamilyRepository } from "./ports";

export interface CommunicationProfileServiceDeps {
  readonly repository: CommunicationProfileRepository;
  readonly families: FamilyRepository;
}

export interface CreateCommunicationProfileInput {
  readonly tenantId: TenantId;
  readonly familyId: Uuid;
  readonly preferredLanguage?: string | null;
  readonly preferredChannels?: readonly CommunicationChannel[];
}

/**
 * Application service for family communication profiles. Creates one profile per
 * family (deriving its organization from the family it attaches to) and manages
 * language, channels, contact schedules, per-category notification levels and
 * accessibility requirements.
 */
export class CommunicationProfileService {
  private readonly repository: CommunicationProfileRepository;
  private readonly families: FamilyRepository;

  constructor(deps: CommunicationProfileServiceDeps) {
    this.repository = deps.repository;
    this.families = deps.families;
  }

  async create(input: CreateCommunicationProfileInput): Promise<CommunicationProfile> {
    const family = await this.requireFamily(input.tenantId, input.familyId);
    await this.assertNoProfile(input.tenantId, input.familyId);
    const profile = createCommunicationProfile({
      tenantId: input.tenantId,
      organizationId: family.organizationId,
      familyId: input.familyId,
      preferredLanguage: input.preferredLanguage ?? null,
      preferredChannels: input.preferredChannels ?? [],
    });
    await this.repository.save(profile);
    return profile;
  }

  async setPreferredLanguage(
    tenantId: TenantId,
    id: Uuid,
    language: string | null,
  ): Promise<CommunicationProfile> {
    return this.mutate(tenantId, id, (p) => setPreferredLanguage(p, language));
  }

  async setPreferredChannels(
    tenantId: TenantId,
    id: Uuid,
    channels: readonly CommunicationChannel[],
  ): Promise<CommunicationProfile> {
    return this.mutate(tenantId, id, (p) => setPreferredChannels(p, channels));
  }

  async putSchedule(
    tenantId: TenantId,
    id: Uuid,
    schedule: CommunicationSchedule,
  ): Promise<CommunicationProfile> {
    return this.mutate(tenantId, id, (p) => putSchedule(p, schedule));
  }

  async removeSchedule(tenantId: TenantId, id: Uuid, label: string): Promise<CommunicationProfile> {
    return this.mutate(tenantId, id, (p) => removeSchedule(p, label));
  }

  async setNotificationPreference(
    tenantId: TenantId,
    id: Uuid,
    category: string,
    level: NotificationLevel,
  ): Promise<CommunicationProfile> {
    return this.mutate(tenantId, id, (p) => setNotificationPreference(p, category, level));
  }

  async clearNotificationPreference(
    tenantId: TenantId,
    id: Uuid,
    category: string,
  ): Promise<CommunicationProfile> {
    return this.mutate(tenantId, id, (p) => clearNotificationPreference(p, category));
  }

  async setAccessibilityRequirements(
    tenantId: TenantId,
    id: Uuid,
    requirements: readonly string[],
  ): Promise<CommunicationProfile> {
    return this.mutate(tenantId, id, (p) => setAccessibilityRequirements(p, requirements));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<CommunicationProfile> {
    return this.require(tenantId, id);
  }

  async getByFamily(tenantId: TenantId, familyId: Uuid): Promise<CommunicationProfile> {
    const profile = await this.repository.findByFamily(tenantId, familyId);
    if (!profile) {
      throw new CommunicationProfileNotFoundError(familyId);
    }
    return profile;
  }

  async list(tenantId: TenantId): Promise<CommunicationProfile[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<CommunicationProfile[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (profile: CommunicationProfile) => CommunicationProfile,
  ): Promise<CommunicationProfile> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async requireFamily(tenantId: TenantId, familyId: Uuid): Promise<Family> {
    const family = await this.families.findById(tenantId, familyId);
    if (!family) {
      throw new FamilyNotFoundError(familyId);
    }
    return family;
  }

  private async assertNoProfile(tenantId: TenantId, familyId: Uuid): Promise<void> {
    if (await this.repository.findByFamily(tenantId, familyId)) {
      throw new DuplicateCommunicationProfileError(familyId);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<CommunicationProfile> {
    const profile = await this.repository.findById(tenantId, id);
    if (!profile) {
      throw new CommunicationProfileNotFoundError(id);
    }
    return profile;
  }
}
