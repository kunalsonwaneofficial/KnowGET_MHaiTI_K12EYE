import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  BuildingNotFoundError,
  DuplicateMaintenanceCodeError,
  EmployeeNotFoundForFacilitiesError,
  FacilitySystemNotFoundError,
  MaintenanceOrderNotFoundError,
  SpaceNotFoundError,
} from "./errors";
import {
  maintenanceAssigned,
  maintenanceCancelled,
  maintenanceCompleted,
  maintenanceReassigned,
  maintenanceReported,
  maintenanceReprioritized,
  maintenanceStarted,
} from "./facilities-events";
import type { MaintenancePriority } from "./facilities-value";
import {
  assignMaintenanceOrder,
  cancelMaintenanceOrder,
  completeMaintenanceOrder,
  type MaintenanceOrder,
  reassignMaintenanceOrder,
  type ReportMaintenanceOrderParams,
  reportMaintenanceOrder,
  setMaintenancePriority,
  startMaintenanceOrder,
} from "./maintenance-order";
import type {
  BuildingRepository,
  EmployeeDirectory,
  FacilitySystemRepository,
  MaintenanceOrderRepository,
  SpaceRepository,
} from "./ports";

/** The report input — the organization is derived from the building, not supplied. */
export type ReportMaintenanceOrderInput = Omit<ReportMaintenanceOrderParams, "organizationId">;

export interface MaintenanceOrderServiceDeps {
  readonly repository: MaintenanceOrderRepository;
  readonly buildings: BuildingRepository;
  readonly spaces: SpaceRepository;
  readonly systems: FacilitySystemRepository;
  readonly employees: EmployeeDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for maintenance orders — the operational campus work queue. Reports an order against a
 * building (deriving the org, validating an optional target space and/or system belongs to that building,
 * and a code unique within the tenant), assigns and reassigns it to an Employee (P2-D12), reprioritizes it,
 * and drives `reported → assigned → in_progress → completed` (with `cancelled` from any open state),
 * publishing the maintenance events. No money — costed asset maintenance is P2-D15.
 */
export class MaintenanceOrderService {
  private readonly repository: MaintenanceOrderRepository;
  private readonly buildings: BuildingRepository;
  private readonly spaces: SpaceRepository;
  private readonly systems: FacilitySystemRepository;
  private readonly employees: EmployeeDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: MaintenanceOrderServiceDeps) {
    this.repository = deps.repository;
    this.buildings = deps.buildings;
    this.spaces = deps.spaces;
    this.systems = deps.systems;
    this.employees = deps.employees;
    this.events = deps.events;
  }

  async report(input: ReportMaintenanceOrderInput): Promise<MaintenanceOrder> {
    const building = await this.buildings.findById(input.tenantId, input.buildingId);
    if (!building) {
      throw new BuildingNotFoundError(input.buildingId);
    }
    if (input.spaceId) {
      const space = await this.spaces.findById(input.tenantId, input.spaceId);
      if (!space || space.buildingId !== input.buildingId) {
        throw new SpaceNotFoundError(input.spaceId);
      }
    }
    if (input.systemId) {
      const system = await this.systems.findById(input.tenantId, input.systemId);
      if (!system || system.buildingId !== input.buildingId) {
        throw new FacilitySystemNotFoundError(input.systemId);
      }
    }
    if (await this.repository.findByCode(input.tenantId, input.code.trim())) {
      throw new DuplicateMaintenanceCodeError(input.code.trim());
    }
    const order = reportMaintenanceOrder({
      ...input,
      organizationId: building.organizationId,
    });
    await this.repository.save(order);
    await this.emit(maintenanceReported(order));
    return order;
  }

  async assign(
    tenantId: TenantId,
    id: Uuid,
    assigneeId: Uuid,
    assignedOn: string,
  ): Promise<MaintenanceOrder> {
    await this.requireEmployee(tenantId, assigneeId);
    const updated = assignMaintenanceOrder(
      await this.require(tenantId, id),
      assigneeId,
      assignedOn,
    );
    await this.repository.save(updated);
    await this.emit(maintenanceAssigned(updated));
    return updated;
  }

  async reassign(tenantId: TenantId, id: Uuid, assigneeId: Uuid): Promise<MaintenanceOrder> {
    await this.requireEmployee(tenantId, assigneeId);
    const updated = reassignMaintenanceOrder(await this.require(tenantId, id), assigneeId);
    await this.repository.save(updated);
    await this.emit(maintenanceReassigned(updated));
    return updated;
  }

  async setPriority(
    tenantId: TenantId,
    id: Uuid,
    priority: MaintenancePriority,
  ): Promise<MaintenanceOrder> {
    const updated = setMaintenancePriority(await this.require(tenantId, id), priority);
    await this.repository.save(updated);
    await this.emit(maintenanceReprioritized(updated));
    return updated;
  }

  async start(tenantId: TenantId, id: Uuid): Promise<MaintenanceOrder> {
    const updated = startMaintenanceOrder(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(maintenanceStarted(updated));
    return updated;
  }

  async complete(tenantId: TenantId, id: Uuid, completedOn: string): Promise<MaintenanceOrder> {
    const updated = completeMaintenanceOrder(await this.require(tenantId, id), completedOn);
    await this.repository.save(updated);
    await this.emit(maintenanceCompleted(updated));
    return updated;
  }

  async cancel(tenantId: TenantId, id: Uuid): Promise<MaintenanceOrder> {
    const updated = cancelMaintenanceOrder(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(maintenanceCancelled(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<MaintenanceOrder> {
    return this.require(tenantId, id);
  }

  async listForBuilding(tenantId: TenantId, buildingId: Uuid): Promise<MaintenanceOrder[]> {
    return this.repository.listByBuilding(tenantId, buildingId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<MaintenanceOrder[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  async listForAssignee(tenantId: TenantId, assigneeId: Uuid): Promise<MaintenanceOrder[]> {
    return this.repository.listByAssignee(tenantId, assigneeId);
  }

  async listOpen(tenantId: TenantId): Promise<MaintenanceOrder[]> {
    return this.repository.listOpen(tenantId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<MaintenanceOrder> {
    const order = await this.repository.findById(tenantId, id);
    if (!order) {
      throw new MaintenanceOrderNotFoundError(id);
    }
    return order;
  }

  private async requireEmployee(tenantId: TenantId, employeeId: Uuid): Promise<void> {
    if (!(await this.employees.exists(tenantId, employeeId))) {
      throw new EmployeeNotFoundForFacilitiesError(employeeId);
    }
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
