import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateFeeStructureCodeError,
  FeeStructureNotFoundError,
  OrganizationNotFoundForFinanceError,
} from "./errors";
import type { FeeComponentInput } from "./fee-component";
import {
  activateFeeStructure,
  addFeeComponent,
  archiveFeeStructure,
  type CreateFeeStructureParams,
  createFeeStructure,
  type FeeStructure,
  removeFeeComponent,
  renameFeeStructure,
  setFeeStructureAcademicYear,
  updateFeeComponentAmount,
} from "./fee-structure";
import { feeStructureActivated, feeStructureArchived, feeStructureCreated } from "./finance-events";
import type { FeeStructureRepository, OrganizationDirectory } from "./ports";

export interface FeeStructureServiceDeps {
  readonly repository: FeeStructureRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for fee structures — the reusable fee-schedule templates students are billed
 * against. Creates a structure (validating the organization and a unique code), edits its components
 * while draft, and drives the `draft → active → archived` lifecycle, publishing the structure events.
 */
export class FeeStructureService {
  private readonly repository: FeeStructureRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: FeeStructureServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async create(input: CreateFeeStructureParams): Promise<FeeStructure> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForFinanceError(input.organizationId);
    }
    if (await this.repository.findByCode(input.tenantId, input.code.trim())) {
      throw new DuplicateFeeStructureCodeError(input.code.trim());
    }
    const structure = createFeeStructure(input);
    await this.repository.save(structure);
    await this.emit(feeStructureCreated(structure));
    return structure;
  }

  async rename(tenantId: TenantId, id: Uuid, name: string): Promise<FeeStructure> {
    return this.mutate(tenantId, id, (s) => renameFeeStructure(s, name));
  }

  async setAcademicYear(
    tenantId: TenantId,
    id: Uuid,
    academicYear: string | null,
  ): Promise<FeeStructure> {
    return this.mutate(tenantId, id, (s) => setFeeStructureAcademicYear(s, academicYear));
  }

  async addComponent(
    tenantId: TenantId,
    id: Uuid,
    input: FeeComponentInput,
  ): Promise<FeeStructure> {
    return this.mutate(tenantId, id, (s) => addFeeComponent(s, input));
  }

  async removeComponent(tenantId: TenantId, id: Uuid, key: string): Promise<FeeStructure> {
    return this.mutate(tenantId, id, (s) => removeFeeComponent(s, key));
  }

  async updateComponentAmount(
    tenantId: TenantId,
    id: Uuid,
    key: string,
    amountMinor: number,
  ): Promise<FeeStructure> {
    return this.mutate(tenantId, id, (s) => updateFeeComponentAmount(s, key, amountMinor));
  }

  async activate(tenantId: TenantId, id: Uuid): Promise<FeeStructure> {
    const updated = activateFeeStructure(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(feeStructureActivated(updated));
    return updated;
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<FeeStructure> {
    const updated = archiveFeeStructure(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(feeStructureArchived(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<FeeStructure> {
    return this.require(tenantId, id);
  }

  async getByCode(tenantId: TenantId, code: string): Promise<FeeStructure> {
    const structure = await this.repository.findByCode(tenantId, code);
    if (!structure) {
      throw new FeeStructureNotFoundError(code);
    }
    return structure;
  }

  async list(tenantId: TenantId): Promise<FeeStructure[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<FeeStructure[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (structure: FeeStructure) => FeeStructure,
  ): Promise<FeeStructure> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<FeeStructure> {
    const structure = await this.repository.findById(tenantId, id);
    if (!structure) {
      throw new FeeStructureNotFoundError(id);
    }
    return structure;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
