import type { TenantId, Uuid } from "@knowget/types";
import {
  archiveAssessmentPlan,
  type AssessmentPlan,
  createAssessmentPlan,
  publishAssessmentPlan,
  renameAssessmentPlan,
  setPlannedAssessments,
} from "./assessment-plan";
import type { AssessmentPlanType, PlannedAssessment } from "./assessment-plan-value";
import {
  AssessmentPlanNotFoundError,
  OrganizationNotFoundForAssessmentError,
  SubjectNotFoundForAssessmentError,
} from "./errors";
import type { AssessmentPlanRepository, OrganizationDirectory, SubjectDirectory } from "./ports";

export interface AssessmentPlanServiceDeps {
  readonly repository: AssessmentPlanRepository;
  readonly organizations: OrganizationDirectory;
  readonly subjects?: SubjectDirectory;
}

export interface CreateAssessmentPlanInput {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly planType: AssessmentPlanType;
  readonly title: string;
  readonly academicYear?: string | null;
  readonly term?: string | null;
  readonly subjectId?: Uuid | null;
  readonly gradeId?: Uuid | null;
  readonly plannedAssessments?: readonly PlannedAssessment[];
}

/**
 * Application service for assessment plans. Creates a plan against a validated Organization
 * (and, when supplied, a validated Subject) and manages its draft → published → archived
 * lifecycle. Publishing makes the assessment/examination schedule authoritative.
 */
export class AssessmentPlanService {
  private readonly repository: AssessmentPlanRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly subjects: SubjectDirectory | undefined;

  constructor(deps: AssessmentPlanServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.subjects = deps.subjects;
  }

  async create(input: CreateAssessmentPlanInput): Promise<AssessmentPlan> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForAssessmentError(input.organizationId);
    }
    if (
      input.subjectId &&
      this.subjects &&
      !(await this.subjects.exists(input.tenantId, input.subjectId))
    ) {
      throw new SubjectNotFoundForAssessmentError(input.subjectId);
    }
    const plan = createAssessmentPlan(input);
    await this.repository.save(plan);
    return plan;
  }

  async rename(tenantId: TenantId, id: Uuid, title: string): Promise<AssessmentPlan> {
    return this.mutate(tenantId, id, (p) => renameAssessmentPlan(p, title));
  }

  async setPlannedAssessments(
    tenantId: TenantId,
    id: Uuid,
    plannedAssessments: readonly PlannedAssessment[],
  ): Promise<AssessmentPlan> {
    return this.mutate(tenantId, id, (p) => setPlannedAssessments(p, plannedAssessments));
  }

  async publish(tenantId: TenantId, id: Uuid): Promise<AssessmentPlan> {
    return this.mutate(tenantId, id, (p) => publishAssessmentPlan(p));
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<AssessmentPlan> {
    return this.mutate(tenantId, id, (p) => archiveAssessmentPlan(p));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<AssessmentPlan> {
    return this.require(tenantId, id);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AssessmentPlan[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (plan: AssessmentPlan) => AssessmentPlan,
  ): Promise<AssessmentPlan> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<AssessmentPlan> {
    const plan = await this.repository.findById(tenantId, id);
    if (!plan) {
      throw new AssessmentPlanNotFoundError(id);
    }
    return plan;
  }
}
