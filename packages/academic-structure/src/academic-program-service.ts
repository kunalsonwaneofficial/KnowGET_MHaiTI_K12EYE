import type { TenantId, Uuid } from "@knowget/types";
import {
  type AcademicProgram,
  activateProgram,
  archiveProgram,
  createAcademicProgram,
  renameProgram,
  setProgramDescription,
  setProgramStage,
} from "./academic-program";
import {
  AcademicProgramNotFoundError,
  DuplicateAcademicProgramError,
  OrganizationNotFoundForAcademicError,
} from "./errors";
import type { AcademicProgramRepository, OrganizationDirectory } from "./ports";
import type { ProgramStage } from "./program";

export interface AcademicProgramServiceDeps {
  readonly repository: AcademicProgramRepository;
  readonly organizations: OrganizationDirectory;
}

export interface CreateAcademicProgramInput {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly name: string;
  readonly code: string;
  readonly stage: ProgramStage;
  readonly description?: string | null;
}

/**
 * Application service for academic programs. Creates at most one program per
 * (organization, code) against a validated Organization, and manages the program's name,
 * description, stage and active/archived lifecycle. Programs group the grades taught under
 * them; the contract publishes no program event.
 */
export class AcademicProgramService {
  private readonly repository: AcademicProgramRepository;
  private readonly organizations: OrganizationDirectory;

  constructor(deps: AcademicProgramServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
  }

  async create(input: CreateAcademicProgramInput): Promise<AcademicProgram> {
    await this.assertOrganizationExists(input.tenantId, input.organizationId);
    await this.assertNoProgram(input.tenantId, input.organizationId, input.code);
    const program = createAcademicProgram(input);
    await this.repository.save(program);
    return program;
  }

  async rename(tenantId: TenantId, id: Uuid, name: string): Promise<AcademicProgram> {
    return this.mutate(tenantId, id, (p) => renameProgram(p, name));
  }

  async setDescription(
    tenantId: TenantId,
    id: Uuid,
    description: string | null,
  ): Promise<AcademicProgram> {
    return this.mutate(tenantId, id, (p) => setProgramDescription(p, description));
  }

  async setStage(tenantId: TenantId, id: Uuid, stage: ProgramStage): Promise<AcademicProgram> {
    return this.mutate(tenantId, id, (p) => setProgramStage(p, stage));
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<AcademicProgram> {
    return this.mutate(tenantId, id, (p) => archiveProgram(p));
  }

  async activate(tenantId: TenantId, id: Uuid): Promise<AcademicProgram> {
    return this.mutate(tenantId, id, (p) => activateProgram(p));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<AcademicProgram> {
    return this.require(tenantId, id);
  }

  async list(tenantId: TenantId): Promise<AcademicProgram[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AcademicProgram[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (program: AcademicProgram) => AcademicProgram,
  ): Promise<AcademicProgram> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async assertOrganizationExists(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForAcademicError(organizationId);
    }
  }

  private async assertNoProgram(
    tenantId: TenantId,
    organizationId: Uuid,
    code: string,
  ): Promise<void> {
    if (await this.repository.findByCode(tenantId, organizationId, code)) {
      throw new DuplicateAcademicProgramError(organizationId, code);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<AcademicProgram> {
    const program = await this.repository.findById(tenantId, id);
    if (!program) {
      throw new AcademicProgramNotFoundError(id);
    }
    return program;
  }
}
