import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  LessonPlanNotFoundError,
  OrganizationNotFoundForTeachingError,
  SubjectNotFoundForTeachingError,
  UnitPlanNotFoundError,
} from "./errors";
import {
  approveLessonPlan,
  archiveLessonPlan,
  createLessonPlan,
  type LessonPlan,
  renameLessonPlan,
  requestLessonChanges,
  reviseLessonPlan,
  setLessonActivities,
  setLessonAssessmentCheckpoints,
  setLessonDifferentiation,
  setLessonObjectives,
  setLessonOutcomes,
  setLessonReflectionNotes,
  setLessonRequiredResources,
  setLessonTeachingStrategies,
  submitLessonForReview,
} from "./lesson-plan";
import { lessonPlanned } from "./teaching-learning-events";
import type {
  LessonPlanRepository,
  OrganizationDirectory,
  SubjectDirectory,
  UnitPlanRepository,
} from "./ports";

export interface LessonPlanServiceDeps {
  readonly repository: LessonPlanRepository;
  readonly organizations: OrganizationDirectory;
  readonly subjects: SubjectDirectory;
  readonly unitPlans?: UnitPlanRepository;
  readonly events?: Pick<EventBus, "publish">;
}

export interface CreateLessonPlanInput {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly subjectId: Uuid;
  readonly unitPlanId?: Uuid | null;
  readonly title: string;
  readonly objectives?: readonly string[];
  readonly learningOutcomeIds?: readonly Uuid[];
  readonly teachingStrategies?: readonly string[];
  readonly learningActivities?: readonly string[];
  readonly assessmentCheckpoints?: readonly string[];
  readonly requiredResourceIds?: readonly Uuid[];
  readonly differentiationStrategies?: readonly string[];
  readonly reflectionNotes?: string | null;
}

/**
 * Application service for lesson plans. Creates a lesson against a validated Organization and
 * Subject (and, when supplied, a validated unit plan), and drives the review-and-approval
 * workflow (submit → approve | request changes; revise an approved plan to a new version).
 * Publishes {@link lessonPlanned} on creation.
 */
export class LessonPlanService {
  private readonly repository: LessonPlanRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly subjects: SubjectDirectory;
  private readonly unitPlans: UnitPlanRepository | undefined;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: LessonPlanServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.subjects = deps.subjects;
    this.unitPlans = deps.unitPlans;
    this.events = deps.events;
  }

  async create(input: CreateLessonPlanInput): Promise<LessonPlan> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForTeachingError(input.organizationId);
    }
    if (!(await this.subjects.exists(input.tenantId, input.subjectId))) {
      throw new SubjectNotFoundForTeachingError(input.subjectId);
    }
    if (
      input.unitPlanId &&
      this.unitPlans &&
      !(await this.unitPlans.findById(input.tenantId, input.unitPlanId))
    ) {
      throw new UnitPlanNotFoundError(input.unitPlanId);
    }
    const plan = createLessonPlan(input);
    await this.repository.save(plan);
    await this.emit(lessonPlanned(plan));
    return plan;
  }

  async rename(tenantId: TenantId, id: Uuid, title: string): Promise<LessonPlan> {
    return this.mutate(tenantId, id, (p) => renameLessonPlan(p, title));
  }

  async setObjectives(
    tenantId: TenantId,
    id: Uuid,
    objectives: readonly string[],
  ): Promise<LessonPlan> {
    return this.mutate(tenantId, id, (p) => setLessonObjectives(p, objectives));
  }

  async setOutcomes(
    tenantId: TenantId,
    id: Uuid,
    outcomeIds: readonly Uuid[],
  ): Promise<LessonPlan> {
    return this.mutate(tenantId, id, (p) => setLessonOutcomes(p, outcomeIds));
  }

  async setTeachingStrategies(
    tenantId: TenantId,
    id: Uuid,
    strategies: readonly string[],
  ): Promise<LessonPlan> {
    return this.mutate(tenantId, id, (p) => setLessonTeachingStrategies(p, strategies));
  }

  async setActivities(
    tenantId: TenantId,
    id: Uuid,
    activities: readonly string[],
  ): Promise<LessonPlan> {
    return this.mutate(tenantId, id, (p) => setLessonActivities(p, activities));
  }

  async setAssessmentCheckpoints(
    tenantId: TenantId,
    id: Uuid,
    checkpoints: readonly string[],
  ): Promise<LessonPlan> {
    return this.mutate(tenantId, id, (p) => setLessonAssessmentCheckpoints(p, checkpoints));
  }

  async setRequiredResources(
    tenantId: TenantId,
    id: Uuid,
    resourceIds: readonly Uuid[],
  ): Promise<LessonPlan> {
    return this.mutate(tenantId, id, (p) => setLessonRequiredResources(p, resourceIds));
  }

  async setDifferentiation(
    tenantId: TenantId,
    id: Uuid,
    strategies: readonly string[],
  ): Promise<LessonPlan> {
    return this.mutate(tenantId, id, (p) => setLessonDifferentiation(p, strategies));
  }

  async setReflectionNotes(
    tenantId: TenantId,
    id: Uuid,
    notes: string | null,
  ): Promise<LessonPlan> {
    return this.mutate(tenantId, id, (p) => setLessonReflectionNotes(p, notes));
  }

  async submitForReview(tenantId: TenantId, id: Uuid): Promise<LessonPlan> {
    return this.mutate(tenantId, id, (p) => submitLessonForReview(p));
  }

  async approve(tenantId: TenantId, id: Uuid): Promise<LessonPlan> {
    return this.mutate(tenantId, id, (p) => approveLessonPlan(p));
  }

  async requestChanges(tenantId: TenantId, id: Uuid): Promise<LessonPlan> {
    return this.mutate(tenantId, id, (p) => requestLessonChanges(p));
  }

  async revise(tenantId: TenantId, id: Uuid, note: string): Promise<LessonPlan> {
    return this.mutate(tenantId, id, (p) => reviseLessonPlan(p, note));
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<LessonPlan> {
    return this.mutate(tenantId, id, (p) => archiveLessonPlan(p));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<LessonPlan> {
    return this.require(tenantId, id);
  }

  async listForSubject(tenantId: TenantId, subjectId: Uuid): Promise<LessonPlan[]> {
    return this.repository.listBySubject(tenantId, subjectId);
  }

  async listForUnit(tenantId: TenantId, unitPlanId: Uuid): Promise<LessonPlan[]> {
    return this.repository.listByUnit(tenantId, unitPlanId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<LessonPlan[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (plan: LessonPlan) => LessonPlan,
  ): Promise<LessonPlan> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<LessonPlan> {
    const plan = await this.repository.findById(tenantId, id);
    if (!plan) {
      throw new LessonPlanNotFoundError(id);
    }
    return plan;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
