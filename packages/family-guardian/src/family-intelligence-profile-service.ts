import type { TenantId, Uuid } from "@knowget/types";
import {
  DuplicateFamilyIntelligenceProfileError,
  FamilyIntelligenceProfileNotFoundError,
  FamilyNotFoundError,
} from "./errors";
import type { Family } from "./family";
import type { FamilyIntelligenceIndicators } from "./family-intelligence-indicators";
import {
  createFamilyIntelligenceProfile,
  type FamilyIntelligenceProfile,
  type RecordInteractionParams,
  recordInteraction,
  updateIndicators,
} from "./family-intelligence-profile";
import type { FamilyIntelligenceProfileRepository, FamilyRepository } from "./ports";

export interface FamilyIntelligenceProfileServiceDeps {
  readonly repository: FamilyIntelligenceProfileRepository;
  readonly families: FamilyRepository;
}

export interface CreateFamilyIntelligenceProfileInput {
  readonly tenantId: TenantId;
  readonly familyId: Uuid;
}

/**
 * Application service for family intelligence profiles. Creates one profile per family
 * (deriving its organization from the family), records AI-ready indicator updates and
 * appends institutional interactions. Owns the model and integration points only —
 * scoring and prediction belong to the Institutional Intelligence program.
 */
export class FamilyIntelligenceProfileService {
  private readonly repository: FamilyIntelligenceProfileRepository;
  private readonly families: FamilyRepository;

  constructor(deps: FamilyIntelligenceProfileServiceDeps) {
    this.repository = deps.repository;
    this.families = deps.families;
  }

  async create(input: CreateFamilyIntelligenceProfileInput): Promise<FamilyIntelligenceProfile> {
    const family = await this.requireFamily(input.tenantId, input.familyId);
    await this.assertNoProfile(input.tenantId, input.familyId);
    const profile = createFamilyIntelligenceProfile({
      tenantId: input.tenantId,
      organizationId: family.organizationId,
      familyId: input.familyId,
    });
    await this.repository.save(profile);
    return profile;
  }

  async updateIndicators(
    tenantId: TenantId,
    id: Uuid,
    patch: Partial<FamilyIntelligenceIndicators>,
  ): Promise<FamilyIntelligenceProfile> {
    return this.mutate(tenantId, id, (p) => updateIndicators(p, patch));
  }

  async recordInteraction(
    tenantId: TenantId,
    id: Uuid,
    params: RecordInteractionParams,
  ): Promise<FamilyIntelligenceProfile> {
    return this.mutate(tenantId, id, (p) => recordInteraction(p, params));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<FamilyIntelligenceProfile> {
    return this.require(tenantId, id);
  }

  async getByFamily(tenantId: TenantId, familyId: Uuid): Promise<FamilyIntelligenceProfile> {
    const profile = await this.repository.findByFamily(tenantId, familyId);
    if (!profile) {
      throw new FamilyIntelligenceProfileNotFoundError(familyId);
    }
    return profile;
  }

  async list(tenantId: TenantId): Promise<FamilyIntelligenceProfile[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<FamilyIntelligenceProfile[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (profile: FamilyIntelligenceProfile) => FamilyIntelligenceProfile,
  ): Promise<FamilyIntelligenceProfile> {
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
      throw new DuplicateFamilyIntelligenceProfileError(familyId);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<FamilyIntelligenceProfile> {
    const profile = await this.repository.findById(tenantId, id);
    if (!profile) {
      throw new FamilyIntelligenceProfileNotFoundError(id);
    }
    return profile;
  }
}
