import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import type { CompetencyInput } from "./competency";
import {
  activateFramework,
  addCompetency,
  archiveFramework,
  type CompetencyFramework,
  createFramework,
  type CreateFrameworkParams,
  removeCompetency,
  renameFramework,
  setFrameworkDescription,
} from "./competency-framework";
import {
  DuplicateFrameworkCodeError,
  FrameworkNotFoundError,
  OrganizationNotFoundForFacultyError,
} from "./errors";
import { frameworkActivated, frameworkArchived, frameworkCreated } from "./faculty-events";
import type { CompetencyFrameworkRepository, OrganizationDirectory } from "./ports";

export interface CompetencyFrameworkServiceDeps {
  readonly repository: CompetencyFrameworkRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for competency frameworks — the professional-standards rubric catalogue.
 * Creates frameworks (validating the organization and a unique code), edits their competencies while
 * draft, and drives the `draft → active → archived` lifecycle, publishing the framework events.
 */
export class CompetencyFrameworkService {
  private readonly repository: CompetencyFrameworkRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: CompetencyFrameworkServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async create(input: CreateFrameworkParams): Promise<CompetencyFramework> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForFacultyError(input.organizationId);
    }
    if (await this.repository.findByCode(input.tenantId, input.code.trim())) {
      throw new DuplicateFrameworkCodeError(input.code.trim());
    }
    const framework = createFramework(input);
    await this.repository.save(framework);
    await this.emit(frameworkCreated(framework));
    return framework;
  }

  async rename(tenantId: TenantId, id: Uuid, name: string): Promise<CompetencyFramework> {
    return this.mutate(tenantId, id, (f) => renameFramework(f, name));
  }

  async setDescription(
    tenantId: TenantId,
    id: Uuid,
    description: string | null,
  ): Promise<CompetencyFramework> {
    return this.mutate(tenantId, id, (f) => setFrameworkDescription(f, description));
  }

  async addCompetency(
    tenantId: TenantId,
    id: Uuid,
    input: CompetencyInput,
  ): Promise<CompetencyFramework> {
    return this.mutate(tenantId, id, (f) => addCompetency(f, input));
  }

  async removeCompetency(tenantId: TenantId, id: Uuid, key: string): Promise<CompetencyFramework> {
    return this.mutate(tenantId, id, (f) => removeCompetency(f, key));
  }

  async activate(tenantId: TenantId, id: Uuid): Promise<CompetencyFramework> {
    const updated = activateFramework(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(frameworkActivated(updated));
    return updated;
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<CompetencyFramework> {
    const updated = archiveFramework(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(frameworkArchived(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<CompetencyFramework> {
    return this.require(tenantId, id);
  }

  async getByCode(tenantId: TenantId, code: string): Promise<CompetencyFramework> {
    const framework = await this.repository.findByCode(tenantId, code);
    if (!framework) {
      throw new FrameworkNotFoundError(code);
    }
    return framework;
  }

  async list(tenantId: TenantId): Promise<CompetencyFramework[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<CompetencyFramework[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (framework: CompetencyFramework) => CompetencyFramework,
  ): Promise<CompetencyFramework> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<CompetencyFramework> {
    const framework = await this.repository.findById(tenantId, id);
    if (!framework) {
      throw new FrameworkNotFoundError(id);
    }
    return framework;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
