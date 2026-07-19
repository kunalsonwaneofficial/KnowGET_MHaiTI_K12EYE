import type { TenantId, Uuid } from "@knowget/types";
import {
  DuplicateProfileError,
  IntelligenceProfileNotFoundError,
  StudentNotFoundError,
} from "./errors";
import {
  type CreateProfileParams,
  createProfile,
  type IntelligenceIndicators,
  type IntelligenceProfile,
  type RecordInterventionParams,
  recordIntervention,
  updateIndicators,
} from "./intelligence-profile";
import type { IntelligenceProfileRepository, StudentRepository } from "./ports";

export interface IntelligenceProfileServiceDeps {
  readonly repository: IntelligenceProfileRepository;
  readonly students: StudentRepository;
}

/**
 * Application service for the AI-ready intelligence profile. Opens one profile per
 * student (validating the student exists), lets source domains update the learner
 * indicators, and records support interventions. Establishes the model and
 * integration points; prediction lives in the Institutional Intelligence program.
 */
export class IntelligenceProfileService {
  private readonly repository: IntelligenceProfileRepository;
  private readonly students: StudentRepository;

  constructor(deps: IntelligenceProfileServiceDeps) {
    this.repository = deps.repository;
    this.students = deps.students;
  }

  async create(input: CreateProfileParams): Promise<IntelligenceProfile> {
    await this.assertStudentExists(input.tenantId, input.studentId);
    if (await this.repository.findByStudent(input.tenantId, input.studentId)) {
      throw new DuplicateProfileError(input.studentId);
    }
    const profile = createProfile(input);
    await this.repository.save(profile);
    return profile;
  }

  async updateIndicators(
    tenantId: TenantId,
    id: Uuid,
    patch: Partial<IntelligenceIndicators>,
  ): Promise<IntelligenceProfile> {
    const updated = updateIndicators(await this.require(tenantId, id), patch);
    await this.repository.save(updated);
    return updated;
  }

  async recordIntervention(
    tenantId: TenantId,
    id: Uuid,
    params: RecordInterventionParams,
  ): Promise<IntelligenceProfile> {
    const updated = recordIntervention(await this.require(tenantId, id), params);
    await this.repository.save(updated);
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<IntelligenceProfile> {
    return this.require(tenantId, id);
  }

  async getForStudent(tenantId: TenantId, studentId: Uuid): Promise<IntelligenceProfile | null> {
    return this.repository.findByStudent(tenantId, studentId);
  }

  async list(tenantId: TenantId): Promise<IntelligenceProfile[]> {
    return this.repository.listByTenant(tenantId);
  }

  private async assertStudentExists(tenantId: TenantId, studentId: Uuid): Promise<void> {
    if (!(await this.students.findById(tenantId, studentId))) {
      throw new StudentNotFoundError(studentId);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<IntelligenceProfile> {
    const profile = await this.repository.findById(tenantId, id);
    if (!profile) {
      throw new IntelligenceProfileNotFoundError(id);
    }
    return profile;
  }
}
