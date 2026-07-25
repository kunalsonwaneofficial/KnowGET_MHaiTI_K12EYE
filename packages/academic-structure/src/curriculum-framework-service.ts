import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { curriculumCreated, curriculumRevised } from "./academic-structure-events";
import {
  activateCurriculum,
  archiveCurriculum,
  createCurriculumFramework,
  type CurriculumFramework,
  reviseCurriculum,
  setAssessmentPhilosophy,
  setCompetencyModel,
  setLearningPhilosophy,
  setSubjectFramework,
} from "./curriculum-framework";
import {
  CurriculumFrameworkNotFoundError,
  DuplicateCurriculumFrameworkError,
  OrganizationNotFoundForAcademicError,
} from "./errors";
import type { CurriculumFrameworkRepository, OrganizationDirectory } from "./ports";

export interface CurriculumFrameworkServiceDeps {
  readonly repository: CurriculumFrameworkRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export interface CreateCurriculumFrameworkInput {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly name: string;
  readonly code: string;
  readonly board: string;
  readonly learningPhilosophy?: string | null;
  readonly competencyModel?: string | null;
  readonly assessmentPhilosophy?: string | null;
  readonly subjectFramework?: readonly string[];
}

/**
 * Application service for curriculum frameworks. Creates at most one framework per
 * (organization, code) against a validated Organization; multiple frameworks (e.g. CBSE
 * and IB) coexist within one organization. Manages the learning/competency/assessment
 * definitions and the version-controlled revision flow. Publishes {@link curriculumCreated}
 * on creation and {@link curriculumRevised} on each revision.
 */
export class CurriculumFrameworkService {
  private readonly repository: CurriculumFrameworkRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: CurriculumFrameworkServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async create(input: CreateCurriculumFrameworkInput): Promise<CurriculumFramework> {
    await this.assertOrganizationExists(input.tenantId, input.organizationId);
    await this.assertNoFramework(input.tenantId, input.organizationId, input.code);
    const framework = createCurriculumFramework(input);
    await this.repository.save(framework);
    await this.emit(curriculumCreated(framework));
    return framework;
  }

  async setLearningPhilosophy(
    tenantId: TenantId,
    id: Uuid,
    philosophy: string | null,
  ): Promise<CurriculumFramework> {
    return this.mutate(tenantId, id, (f) => setLearningPhilosophy(f, philosophy));
  }

  async setCompetencyModel(
    tenantId: TenantId,
    id: Uuid,
    model: string | null,
  ): Promise<CurriculumFramework> {
    return this.mutate(tenantId, id, (f) => setCompetencyModel(f, model));
  }

  async setAssessmentPhilosophy(
    tenantId: TenantId,
    id: Uuid,
    philosophy: string | null,
  ): Promise<CurriculumFramework> {
    return this.mutate(tenantId, id, (f) => setAssessmentPhilosophy(f, philosophy));
  }

  async setSubjectFramework(
    tenantId: TenantId,
    id: Uuid,
    subjects: readonly string[],
  ): Promise<CurriculumFramework> {
    return this.mutate(tenantId, id, (f) => setSubjectFramework(f, subjects));
  }

  async activate(tenantId: TenantId, id: Uuid): Promise<CurriculumFramework> {
    return this.mutate(tenantId, id, (f) => activateCurriculum(f));
  }

  async revise(tenantId: TenantId, id: Uuid, note: string): Promise<CurriculumFramework> {
    const framework = reviseCurriculum(await this.require(tenantId, id), note);
    await this.repository.save(framework);
    await this.emit(curriculumRevised(framework));
    return framework;
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<CurriculumFramework> {
    return this.mutate(tenantId, id, (f) => archiveCurriculum(f));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<CurriculumFramework> {
    return this.require(tenantId, id);
  }

  async getByCode(
    tenantId: TenantId,
    organizationId: Uuid,
    code: string,
  ): Promise<CurriculumFramework | null> {
    return this.repository.findByCode(tenantId, organizationId, code);
  }

  async list(tenantId: TenantId): Promise<CurriculumFramework[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<CurriculumFramework[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (framework: CurriculumFramework) => CurriculumFramework,
  ): Promise<CurriculumFramework> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async assertOrganizationExists(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForAcademicError(organizationId);
    }
  }

  private async assertNoFramework(
    tenantId: TenantId,
    organizationId: Uuid,
    code: string,
  ): Promise<void> {
    if (await this.repository.findByCode(tenantId, organizationId, code)) {
      throw new DuplicateCurriculumFrameworkError(organizationId, code);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<CurriculumFramework> {
    const framework = await this.repository.findById(tenantId, id);
    if (!framework) {
      throw new CurriculumFrameworkNotFoundError(id);
    }
    return framework;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
