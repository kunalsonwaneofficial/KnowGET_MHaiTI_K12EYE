import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  type AdmissionCycle,
  archiveCycle,
  closeCycle,
  type CreateAdmissionCycleParams,
  createAdmissionCycle,
  type GradeCapacity,
  openCycle,
  renameCycle,
  setCycleGradeCapacities,
  setCycleWindow,
} from "./admission-cycle";
import {
  cycleArchived,
  cycleClosed,
  cycleCreated,
  cycleOpened,
  cycleRenamed,
  cycleSeatPlanSet,
  cycleWindowSet,
} from "./admissions-events";
import {
  CycleNotFoundError,
  DuplicateCycleCodeError,
  OrganizationNotFoundForAdmissionsError,
} from "./errors";
import type { AdmissionCycleRepository, OrganizationDirectory } from "./ports";

export interface AdmissionCycleServiceDeps {
  readonly repository: AdmissionCycleRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for admission cycles. Creates a cycle (validating the organization and a unique code
 * per tenant), edits its name / seat plan / window, and drives `planning → open → closed → archived`,
 * publishing the cycle events.
 */
export class AdmissionCycleService {
  private readonly repository: AdmissionCycleRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AdmissionCycleServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async create(input: CreateAdmissionCycleParams): Promise<AdmissionCycle> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForAdmissionsError(input.organizationId);
    }
    if (await this.repository.findByCode(input.tenantId, input.code.trim())) {
      throw new DuplicateCycleCodeError(input.code.trim());
    }
    const cycle = createAdmissionCycle(input);
    await this.repository.save(cycle);
    await this.emit(cycleCreated(cycle));
    return cycle;
  }

  async rename(tenantId: TenantId, id: Uuid, name: string): Promise<AdmissionCycle> {
    const updated = renameCycle(await this.require(tenantId, id), name);
    await this.repository.save(updated);
    await this.emit(cycleRenamed(updated));
    return updated;
  }

  async setGradeCapacities(
    tenantId: TenantId,
    id: Uuid,
    gradeCapacities: readonly GradeCapacity[],
  ): Promise<AdmissionCycle> {
    const updated = setCycleGradeCapacities(await this.require(tenantId, id), gradeCapacities);
    await this.repository.save(updated);
    await this.emit(cycleSeatPlanSet(updated));
    return updated;
  }

  async setWindow(
    tenantId: TenantId,
    id: Uuid,
    opensOn: string | null,
    closesOn: string | null,
  ): Promise<AdmissionCycle> {
    const updated = setCycleWindow(await this.require(tenantId, id), opensOn, closesOn);
    await this.repository.save(updated);
    await this.emit(cycleWindowSet(updated));
    return updated;
  }

  async open(tenantId: TenantId, id: Uuid): Promise<AdmissionCycle> {
    const updated = openCycle(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(cycleOpened(updated));
    return updated;
  }

  async close(tenantId: TenantId, id: Uuid): Promise<AdmissionCycle> {
    const updated = closeCycle(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(cycleClosed(updated));
    return updated;
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<AdmissionCycle> {
    const updated = archiveCycle(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(cycleArchived(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<AdmissionCycle> {
    return this.require(tenantId, id);
  }

  async getByCode(tenantId: TenantId, code: string): Promise<AdmissionCycle> {
    const cycle = await this.repository.findByCode(tenantId, code);
    if (!cycle) {
      throw new CycleNotFoundError(code);
    }
    return cycle;
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AdmissionCycle[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<AdmissionCycle> {
    const cycle = await this.repository.findById(tenantId, id);
    if (!cycle) {
      throw new CycleNotFoundError(id);
    }
    return cycle;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
