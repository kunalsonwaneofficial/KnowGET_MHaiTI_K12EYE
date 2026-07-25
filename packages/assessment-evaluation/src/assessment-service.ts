import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  type Assessment,
  cancelAssessment,
  completeAssessment,
  createAssessment,
  publishAssessment,
  renameAssessment,
  setAssessmentCompetencies,
  setAssessmentOutcomes,
  setMaximumMarks,
  setRubric,
  startAssessment,
} from "./assessment";
import {
  assessmentCompleted,
  assessmentPublished,
  assessmentStarted,
} from "./assessment-evaluation-events";
import type {
  AssessmentType,
  DeliveryMode,
  EvaluationStrategy,
  RubricCriterion,
} from "./assessment-value";
import {
  AssessmentFrameworkNotFoundError,
  AssessmentNotFoundError,
  AssessmentPlanNotFoundError,
  OrganizationNotFoundForAssessmentError,
  SubjectNotFoundForAssessmentError,
} from "./errors";
import type {
  AssessmentFrameworkRepository,
  AssessmentPlanRepository,
  AssessmentRepository,
  OrganizationDirectory,
  SubjectDirectory,
} from "./ports";

export interface AssessmentServiceDeps {
  readonly repository: AssessmentRepository;
  readonly organizations: OrganizationDirectory;
  readonly subjects: SubjectDirectory;
  readonly frameworks?: AssessmentFrameworkRepository;
  readonly plans?: AssessmentPlanRepository;
  readonly events?: Pick<EventBus, "publish">;
}

export interface CreateAssessmentInput {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly subjectId: Uuid;
  readonly assessmentType: AssessmentType;
  readonly title: string;
  readonly frameworkId?: Uuid | null;
  readonly planId?: Uuid | null;
  readonly learningOutcomeIds?: readonly Uuid[];
  readonly competencies?: readonly string[];
  readonly maximumMarks?: number;
  readonly rubric?: readonly RubricCriterion[];
  readonly evaluationStrategy?: EvaluationStrategy;
  readonly deliveryMode?: DeliveryMode;
}

/**
 * Application service for assessments. Creates an assessment against a validated Organization
 * and Subject (and, when supplied, a validated framework and plan), and drives
 * draft → published → in_progress → completed | cancelled. Publishes {@link assessmentPublished},
 * {@link assessmentStarted} and {@link assessmentCompleted}.
 */
export class AssessmentService {
  private readonly repository: AssessmentRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly subjects: SubjectDirectory;
  private readonly frameworks: AssessmentFrameworkRepository | undefined;
  private readonly plans: AssessmentPlanRepository | undefined;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AssessmentServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.subjects = deps.subjects;
    this.frameworks = deps.frameworks;
    this.plans = deps.plans;
    this.events = deps.events;
  }

  async create(input: CreateAssessmentInput): Promise<Assessment> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForAssessmentError(input.organizationId);
    }
    if (!(await this.subjects.exists(input.tenantId, input.subjectId))) {
      throw new SubjectNotFoundForAssessmentError(input.subjectId);
    }
    if (
      input.frameworkId &&
      this.frameworks &&
      !(await this.frameworks.findById(input.tenantId, input.frameworkId))
    ) {
      throw new AssessmentFrameworkNotFoundError(input.frameworkId);
    }
    if (input.planId && this.plans && !(await this.plans.findById(input.tenantId, input.planId))) {
      throw new AssessmentPlanNotFoundError(input.planId);
    }
    const assessment = createAssessment(input);
    await this.repository.save(assessment);
    return assessment;
  }

  async rename(tenantId: TenantId, id: Uuid, title: string): Promise<Assessment> {
    return this.mutate(tenantId, id, (a) => renameAssessment(a, title));
  }

  async setOutcomes(
    tenantId: TenantId,
    id: Uuid,
    outcomeIds: readonly Uuid[],
  ): Promise<Assessment> {
    return this.mutate(tenantId, id, (a) => setAssessmentOutcomes(a, outcomeIds));
  }

  async setCompetencies(
    tenantId: TenantId,
    id: Uuid,
    competencies: readonly string[],
  ): Promise<Assessment> {
    return this.mutate(tenantId, id, (a) => setAssessmentCompetencies(a, competencies));
  }

  async setMaximumMarks(tenantId: TenantId, id: Uuid, maximumMarks: number): Promise<Assessment> {
    return this.mutate(tenantId, id, (a) => setMaximumMarks(a, maximumMarks));
  }

  async setRubric(
    tenantId: TenantId,
    id: Uuid,
    rubric: readonly RubricCriterion[],
  ): Promise<Assessment> {
    return this.mutate(tenantId, id, (a) => setRubric(a, rubric));
  }

  async publish(tenantId: TenantId, id: Uuid): Promise<Assessment> {
    const published = await this.mutate(tenantId, id, (a) => publishAssessment(a));
    await this.emit(assessmentPublished(published));
    return published;
  }

  async start(tenantId: TenantId, id: Uuid): Promise<Assessment> {
    const started = await this.mutate(tenantId, id, (a) => startAssessment(a));
    await this.emit(assessmentStarted(started));
    return started;
  }

  async complete(tenantId: TenantId, id: Uuid): Promise<Assessment> {
    const completed = await this.mutate(tenantId, id, (a) => completeAssessment(a));
    await this.emit(assessmentCompleted(completed));
    return completed;
  }

  async cancel(tenantId: TenantId, id: Uuid): Promise<Assessment> {
    return this.mutate(tenantId, id, (a) => cancelAssessment(a));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Assessment> {
    return this.require(tenantId, id);
  }

  async listForSubject(tenantId: TenantId, subjectId: Uuid): Promise<Assessment[]> {
    return this.repository.listBySubject(tenantId, subjectId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Assessment[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (assessment: Assessment) => Assessment,
  ): Promise<Assessment> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Assessment> {
    const assessment = await this.repository.findById(tenantId, id);
    if (!assessment) {
      throw new AssessmentNotFoundError(id);
    }
    return assessment;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
