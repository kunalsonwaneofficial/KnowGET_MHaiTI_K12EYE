import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  AcademicPlanNotFoundError,
  CurriculumNotFoundForTeachingError,
  OrganizationNotFoundForTeachingError,
  SubjectNotFoundForTeachingError,
  UnitPlanNotFoundError,
} from "./errors";
import { unitPlanCreated } from "./teaching-learning-events";
import type {
  AcademicPlanRepository,
  CurriculumDirectory,
  OrganizationDirectory,
  SubjectDirectory,
  UnitPlanRepository,
} from "./ports";
import {
  activateUnitPlan,
  archiveUnitPlan,
  createUnitPlan,
  renameUnitPlan,
  setUnitPlanAssessmentStrategy,
  setUnitPlanCompetencies,
  setUnitPlanEstimatedHours,
  setUnitPlanOutcomes,
  type UnitPlan,
} from "./unit-plan";

export interface UnitPlanServiceDeps {
  readonly repository: UnitPlanRepository;
  readonly organizations: OrganizationDirectory;
  readonly subjects: SubjectDirectory;
  readonly curricula?: CurriculumDirectory;
  readonly academicPlans?: AcademicPlanRepository;
  readonly events?: Pick<EventBus, "publish">;
}

export interface CreateUnitPlanInput {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly subjectId: Uuid;
  readonly academicPlanId?: Uuid | null;
  readonly title: string;
  readonly sequence?: number;
  readonly curriculumFrameworkId?: Uuid | null;
  readonly learningOutcomeIds?: readonly Uuid[];
  readonly competencies?: readonly string[];
  readonly estimatedInstructionalHours?: number;
  readonly assessmentStrategy?: string | null;
}

/**
 * Application service for unit plans. Creates a unit against a validated Organization and
 * Subject (and, when supplied, a validated curriculum framework and academic plan), and
 * manages its draft → active → archived lifecycle. Publishes {@link unitPlanCreated}; lessons
 * are planned against active units.
 */
export class UnitPlanService {
  private readonly repository: UnitPlanRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly subjects: SubjectDirectory;
  private readonly curricula: CurriculumDirectory | undefined;
  private readonly academicPlans: AcademicPlanRepository | undefined;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: UnitPlanServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.subjects = deps.subjects;
    this.curricula = deps.curricula;
    this.academicPlans = deps.academicPlans;
    this.events = deps.events;
  }

  async create(input: CreateUnitPlanInput): Promise<UnitPlan> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForTeachingError(input.organizationId);
    }
    if (!(await this.subjects.exists(input.tenantId, input.subjectId))) {
      throw new SubjectNotFoundForTeachingError(input.subjectId);
    }
    if (
      input.curriculumFrameworkId &&
      this.curricula &&
      !(await this.curricula.exists(input.tenantId, input.curriculumFrameworkId))
    ) {
      throw new CurriculumNotFoundForTeachingError(input.curriculumFrameworkId);
    }
    if (
      input.academicPlanId &&
      this.academicPlans &&
      !(await this.academicPlans.findById(input.tenantId, input.academicPlanId))
    ) {
      throw new AcademicPlanNotFoundError(input.academicPlanId);
    }
    const unit = createUnitPlan(input);
    await this.repository.save(unit);
    await this.emit(unitPlanCreated(unit));
    return unit;
  }

  async rename(tenantId: TenantId, id: Uuid, title: string): Promise<UnitPlan> {
    return this.mutate(tenantId, id, (u) => renameUnitPlan(u, title));
  }

  async setOutcomes(tenantId: TenantId, id: Uuid, outcomeIds: readonly Uuid[]): Promise<UnitPlan> {
    return this.mutate(tenantId, id, (u) => setUnitPlanOutcomes(u, outcomeIds));
  }

  async setCompetencies(
    tenantId: TenantId,
    id: Uuid,
    competencies: readonly string[],
  ): Promise<UnitPlan> {
    return this.mutate(tenantId, id, (u) => setUnitPlanCompetencies(u, competencies));
  }

  async setEstimatedHours(tenantId: TenantId, id: Uuid, hours: number): Promise<UnitPlan> {
    return this.mutate(tenantId, id, (u) => setUnitPlanEstimatedHours(u, hours));
  }

  async setAssessmentStrategy(
    tenantId: TenantId,
    id: Uuid,
    assessmentStrategy: string | null,
  ): Promise<UnitPlan> {
    return this.mutate(tenantId, id, (u) => setUnitPlanAssessmentStrategy(u, assessmentStrategy));
  }

  async activate(tenantId: TenantId, id: Uuid): Promise<UnitPlan> {
    return this.mutate(tenantId, id, (u) => activateUnitPlan(u));
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<UnitPlan> {
    return this.mutate(tenantId, id, (u) => archiveUnitPlan(u));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<UnitPlan> {
    return this.require(tenantId, id);
  }

  async listForSubject(tenantId: TenantId, subjectId: Uuid): Promise<UnitPlan[]> {
    return this.repository.listBySubject(tenantId, subjectId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<UnitPlan[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (unit: UnitPlan) => UnitPlan,
  ): Promise<UnitPlan> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<UnitPlan> {
    const unit = await this.repository.findById(tenantId, id);
    if (!unit) {
      throw new UnitPlanNotFoundError(id);
    }
    return unit;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
