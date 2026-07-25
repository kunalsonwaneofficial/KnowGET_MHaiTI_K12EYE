import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { competencyUpdated } from "./assessment-evaluation-events";
import {
  type CompetencyProfile,
  createCompetencyProfile,
  setCompetencyMastery,
  type SetMasteryParams,
} from "./competency-profile";
import {
  CompetencyProfileNotFoundError,
  OrganizationNotFoundForAssessmentError,
  StudentNotFoundForAssessmentError,
} from "./errors";
import type { CompetencyProfileRepository, OrganizationDirectory, StudentDirectory } from "./ports";

export interface CompetencyProfileServiceDeps {
  readonly repository: CompetencyProfileRepository;
  readonly organizations: OrganizationDirectory;
  readonly students: StudentDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for competency profiles. Ensures a validated Student has exactly one
 * profile per organization and updates competency mastery — tracked **independently of raw
 * marks** — recording each change in the growth trajectory. Supporting learning-evidence refs
 * (P2-D09) are stored as optional context. Publishes {@link competencyUpdated}.
 */
export class CompetencyProfileService {
  private readonly repository: CompetencyProfileRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly students: StudentDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: CompetencyProfileServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.students = deps.students;
    this.events = deps.events;
  }

  /** Get the student's competency profile, creating an empty one if none exists yet. */
  async ensure(
    tenantId: TenantId,
    organizationId: Uuid,
    studentId: Uuid,
  ): Promise<CompetencyProfile> {
    const existing = await this.repository.findByStudent(tenantId, studentId);
    if (existing) {
      return existing;
    }
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForAssessmentError(organizationId);
    }
    if (!(await this.students.exists(tenantId, studentId))) {
      throw new StudentNotFoundForAssessmentError(studentId);
    }
    const profile = createCompetencyProfile({ tenantId, organizationId, studentId });
    await this.repository.save(profile);
    return profile;
  }

  /** Set (or upsert) a competency's mastery for a student, recording the change in the trajectory. */
  async setMastery(
    tenantId: TenantId,
    id: Uuid,
    params: SetMasteryParams,
  ): Promise<CompetencyProfile> {
    const profile = setCompetencyMastery(await this.require(tenantId, id), params);
    await this.repository.save(profile);
    await this.emit(competencyUpdated(profile, params.competencyId, params.masteryLevel));
    return profile;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<CompetencyProfile> {
    return this.require(tenantId, id);
  }

  async getByStudent(tenantId: TenantId, studentId: Uuid): Promise<CompetencyProfile | null> {
    return this.repository.findByStudent(tenantId, studentId);
  }

  async listForOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<CompetencyProfile[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<CompetencyProfile> {
    const profile = await this.repository.findById(tenantId, id);
    if (!profile) {
      throw new CompetencyProfileNotFoundError(id);
    }
    return profile;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
