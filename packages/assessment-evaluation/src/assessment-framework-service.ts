import type { TenantId, Uuid } from "@knowget/types";
import {
  activateAssessmentFramework,
  archiveAssessmentFramework,
  type AssessmentFramework,
  createAssessmentFramework,
  renameAssessmentFramework,
  reviseAssessmentFramework,
  setCompetencyModel,
  setGradeBands,
  setPromotionCriteria,
  setWeightageRules,
} from "./assessment-framework";
import type { AssessmentModel, GradeBand } from "./assessment-framework-value";
import {
  AssessmentFrameworkNotFoundError,
  DuplicateAssessmentFrameworkError,
  OrganizationNotFoundForAssessmentError,
} from "./errors";
import type { AssessmentFrameworkRepository, OrganizationDirectory } from "./ports";

export interface AssessmentFrameworkServiceDeps {
  readonly repository: AssessmentFrameworkRepository;
  readonly organizations: OrganizationDirectory;
}

export interface CreateAssessmentFrameworkInput {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly assessmentModel: AssessmentModel;
  readonly weightageRules?: Readonly<Record<string, unknown>>;
  readonly gradeBands?: readonly GradeBand[];
  readonly competencyModel?: readonly string[];
  readonly promotionCriteria?: Readonly<Record<string, unknown>>;
}

/**
 * Application service for assessment frameworks. Registers at most one framework per
 * (organization, code) against a validated Organization and manages its version-controlled
 * draft → active → archived lifecycle. Only active frameworks govern assessment; the grading
 * engine consumes the framework's grade bands.
 */
export class AssessmentFrameworkService {
  private readonly repository: AssessmentFrameworkRepository;
  private readonly organizations: OrganizationDirectory;

  constructor(deps: AssessmentFrameworkServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
  }

  async create(input: CreateAssessmentFrameworkInput): Promise<AssessmentFramework> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForAssessmentError(input.organizationId);
    }
    if (await this.repository.findByCode(input.tenantId, input.organizationId, input.code)) {
      throw new DuplicateAssessmentFrameworkError(input.organizationId, input.code);
    }
    const framework = createAssessmentFramework(input);
    await this.repository.save(framework);
    return framework;
  }

  async rename(tenantId: TenantId, id: Uuid, name: string): Promise<AssessmentFramework> {
    return this.mutate(tenantId, id, (f) => renameAssessmentFramework(f, name));
  }

  async setWeightageRules(
    tenantId: TenantId,
    id: Uuid,
    weightageRules: Readonly<Record<string, unknown>>,
  ): Promise<AssessmentFramework> {
    return this.mutate(tenantId, id, (f) => setWeightageRules(f, weightageRules));
  }

  async setGradeBands(
    tenantId: TenantId,
    id: Uuid,
    gradeBands: readonly GradeBand[],
  ): Promise<AssessmentFramework> {
    return this.mutate(tenantId, id, (f) => setGradeBands(f, gradeBands));
  }

  async setCompetencyModel(
    tenantId: TenantId,
    id: Uuid,
    competencyModel: readonly string[],
  ): Promise<AssessmentFramework> {
    return this.mutate(tenantId, id, (f) => setCompetencyModel(f, competencyModel));
  }

  async setPromotionCriteria(
    tenantId: TenantId,
    id: Uuid,
    promotionCriteria: Readonly<Record<string, unknown>>,
  ): Promise<AssessmentFramework> {
    return this.mutate(tenantId, id, (f) => setPromotionCriteria(f, promotionCriteria));
  }

  async activate(tenantId: TenantId, id: Uuid): Promise<AssessmentFramework> {
    return this.mutate(tenantId, id, (f) => activateAssessmentFramework(f));
  }

  async revise(tenantId: TenantId, id: Uuid, note: string): Promise<AssessmentFramework> {
    return this.mutate(tenantId, id, (f) => reviseAssessmentFramework(f, note));
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<AssessmentFramework> {
    return this.mutate(tenantId, id, (f) => archiveAssessmentFramework(f));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<AssessmentFramework> {
    return this.require(tenantId, id);
  }

  async getByCode(
    tenantId: TenantId,
    organizationId: Uuid,
    code: string,
  ): Promise<AssessmentFramework | null> {
    return this.repository.findByCode(tenantId, organizationId, code);
  }

  async listForOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<AssessmentFramework[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (framework: AssessmentFramework) => AssessmentFramework,
  ): Promise<AssessmentFramework> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<AssessmentFramework> {
    const framework = await this.repository.findById(tenantId, id);
    if (!framework) {
      throw new AssessmentFrameworkNotFoundError(id);
    }
    return framework;
  }
}
