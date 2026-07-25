import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { isDepartmentActive } from "./department";
import {
  DepartmentNotActiveError,
  DepartmentNotFoundError,
  DuplicatePositionCodeError,
  PositionNotFoundError,
} from "./errors";
import type { DepartmentRepository, PositionRepository } from "./ports";
import {
  closePosition,
  type CreatePositionParams,
  createPosition,
  holdPosition,
  openPosition,
  type Position,
  resumePosition,
  retitlePosition,
  setGrade,
  setHeadcount,
  setPositionDescription,
} from "./position";
import { positionClosed, positionCreated, positionOpened } from "./workforce-events";

/** The service create input — the organization is derived from the department, not supplied. */
export type CreatePositionInput = Omit<CreatePositionParams, "organizationId">;

export interface PositionServiceDeps {
  readonly repository: PositionRepository;
  readonly departments: DepartmentRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for positions — the defined-post catalogue. Creates positions under an active
 * department (deriving the organization from the department, enforcing a unique code), drives the
 * `draft → open → on_hold → closed` lifecycle, and maintains the title / headcount / grade. Publishes
 * the position created / opened / closed events. Compensation amounts are never handled here — only
 * the pay grade/band label.
 */
export class PositionService {
  private readonly repository: PositionRepository;
  private readonly departments: DepartmentRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: PositionServiceDeps) {
    this.repository = deps.repository;
    this.departments = deps.departments;
    this.events = deps.events;
  }

  async create(input: CreatePositionInput): Promise<Position> {
    const department = await this.departments.findById(input.tenantId, input.departmentId);
    if (!department) {
      throw new DepartmentNotFoundError(input.departmentId);
    }
    if (!isDepartmentActive(department)) {
      throw new DepartmentNotActiveError(department.id);
    }
    await this.assertCodeFree(input.tenantId, input.code.trim());
    const position = createPosition({ ...input, organizationId: department.organizationId });
    await this.repository.save(position);
    await this.emit(positionCreated(position));
    return position;
  }

  async retitle(tenantId: TenantId, id: Uuid, title: string): Promise<Position> {
    return this.mutate(tenantId, id, (p) => retitlePosition(p, title));
  }

  async setHeadcount(tenantId: TenantId, id: Uuid, headcount: number): Promise<Position> {
    return this.mutate(tenantId, id, (p) => setHeadcount(p, headcount));
  }

  async setGrade(tenantId: TenantId, id: Uuid, grade: string | null): Promise<Position> {
    return this.mutate(tenantId, id, (p) => setGrade(p, grade));
  }

  async setDescription(
    tenantId: TenantId,
    id: Uuid,
    description: string | null,
  ): Promise<Position> {
    return this.mutate(tenantId, id, (p) => setPositionDescription(p, description));
  }

  async open(tenantId: TenantId, id: Uuid): Promise<Position> {
    const updated = openPosition(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(positionOpened(updated));
    return updated;
  }

  async hold(tenantId: TenantId, id: Uuid): Promise<Position> {
    return this.mutate(tenantId, id, holdPosition);
  }

  async resume(tenantId: TenantId, id: Uuid): Promise<Position> {
    return this.mutate(tenantId, id, resumePosition);
  }

  async close(tenantId: TenantId, id: Uuid): Promise<Position> {
    const updated = closePosition(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(positionClosed(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Position> {
    return this.require(tenantId, id);
  }

  async getByCode(tenantId: TenantId, code: string): Promise<Position> {
    const position = await this.repository.findByCode(tenantId, code);
    if (!position) {
      throw new PositionNotFoundError(code);
    }
    return position;
  }

  async list(tenantId: TenantId): Promise<Position[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForDepartment(tenantId: TenantId, departmentId: Uuid): Promise<Position[]> {
    return this.repository.listByDepartment(tenantId, departmentId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Position[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (position: Position) => Position,
  ): Promise<Position> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async assertCodeFree(tenantId: TenantId, code: string): Promise<void> {
    if (await this.repository.findByCode(tenantId, code)) {
      throw new DuplicatePositionCodeError(code);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Position> {
    const position = await this.repository.findById(tenantId, id);
    if (!position) {
      throw new PositionNotFoundError(id);
    }
    return position;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
