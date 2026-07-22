import type { TenantId, Uuid } from "@knowget/types";
import {
  DuplicateWellbeingProfileError,
  StudentNotFoundForWellbeingError,
  WellbeingProfileNotFoundError,
} from "./errors";
import type { StudentDirectory, WellbeingProfileRepository } from "./ports";
import type { WellbeingIndicators } from "./wellbeing-indicators";
import type { WellbeingDimensions, WellbeingLevel } from "./wellbeing-level";
import {
  createWellbeingProfile,
  putSuccessMetric,
  removeSuccessMetric,
  setDimension,
  setLearningSupportIndicators,
  updateDimensions,
  updateIndicators,
  type WellbeingDimensionKey,
  type WellbeingProfile,
} from "./wellbeing-profile";

export interface WellbeingProfileServiceDeps {
  readonly repository: WellbeingProfileRepository;
  readonly students: StudentDirectory;
}

export interface CreateWellbeingProfileInput {
  readonly tenantId: TenantId;
  readonly studentId: Uuid;
}

/**
 * Application service for wellbeing profiles. Creates at most one profile per learner,
 * deriving the organization from the Student (P2-D03) so identity is never duplicated,
 * and drives the dimension, learning-support, success-metric and AI-indicator surfaces.
 * The profile is the aggregating read model for a learner's holistic wellbeing; it holds
 * no clinical or safeguarding data — those live in dedicated, separately-gated records.
 */
export class WellbeingProfileService {
  private readonly repository: WellbeingProfileRepository;
  private readonly students: StudentDirectory;

  constructor(deps: WellbeingProfileServiceDeps) {
    this.repository = deps.repository;
    this.students = deps.students;
  }

  async create(input: CreateWellbeingProfileInput): Promise<WellbeingProfile> {
    const organizationId = await this.resolveOrganization(input.tenantId, input.studentId);
    await this.assertNoProfile(input.tenantId, input.studentId);
    const profile = createWellbeingProfile({
      tenantId: input.tenantId,
      organizationId,
      studentId: input.studentId,
    });
    await this.repository.save(profile);
    return profile;
  }

  async setDimension(
    tenantId: TenantId,
    id: Uuid,
    dimension: WellbeingDimensionKey,
    level: WellbeingLevel | null,
  ): Promise<WellbeingProfile> {
    return this.mutate(tenantId, id, (p) => setDimension(p, dimension, level));
  }

  async updateDimensions(
    tenantId: TenantId,
    id: Uuid,
    patch: Partial<WellbeingDimensions>,
  ): Promise<WellbeingProfile> {
    return this.mutate(tenantId, id, (p) => updateDimensions(p, patch));
  }

  async setLearningSupportIndicators(
    tenantId: TenantId,
    id: Uuid,
    indicators: readonly string[],
  ): Promise<WellbeingProfile> {
    return this.mutate(tenantId, id, (p) => setLearningSupportIndicators(p, indicators));
  }

  async putSuccessMetric(
    tenantId: TenantId,
    id: Uuid,
    name: string,
    value: number,
  ): Promise<WellbeingProfile> {
    return this.mutate(tenantId, id, (p) => putSuccessMetric(p, name, value));
  }

  async removeSuccessMetric(tenantId: TenantId, id: Uuid, name: string): Promise<WellbeingProfile> {
    return this.mutate(tenantId, id, (p) => removeSuccessMetric(p, name));
  }

  async updateIndicators(
    tenantId: TenantId,
    id: Uuid,
    patch: Partial<WellbeingIndicators>,
  ): Promise<WellbeingProfile> {
    return this.mutate(tenantId, id, (p) => updateIndicators(p, patch));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<WellbeingProfile> {
    return this.require(tenantId, id);
  }

  async getByStudent(tenantId: TenantId, studentId: Uuid): Promise<WellbeingProfile | null> {
    return this.repository.findByStudent(tenantId, studentId);
  }

  async list(tenantId: TenantId): Promise<WellbeingProfile[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<WellbeingProfile[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (profile: WellbeingProfile) => WellbeingProfile,
  ): Promise<WellbeingProfile> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async resolveOrganization(tenantId: TenantId, studentId: Uuid): Promise<Uuid> {
    const organizationId = await this.students.organizationOf(tenantId, studentId);
    if (!organizationId) {
      throw new StudentNotFoundForWellbeingError(studentId);
    }
    return organizationId;
  }

  private async assertNoProfile(tenantId: TenantId, studentId: Uuid): Promise<void> {
    if (await this.repository.findByStudent(tenantId, studentId)) {
      throw new DuplicateWellbeingProfileError(studentId);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<WellbeingProfile> {
    const profile = await this.repository.findById(tenantId, id);
    if (!profile) {
      throw new WellbeingProfileNotFoundError(id);
    }
    return profile;
  }
}
