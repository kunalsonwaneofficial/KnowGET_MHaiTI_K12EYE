import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  archiveDepartment,
  assignDepartmentHead,
  createDepartment,
  type CreateDepartmentParams,
  type Department,
  reactivateDepartment,
  renameDepartment,
  reparentDepartment,
  setCostCenter,
  setDepartmentDescription,
} from "./department";
import {
  CrossOrganizationDepartmentError,
  DepartmentHierarchyError,
  DepartmentNotFoundError,
  DuplicateDepartmentCodeError,
  OrganizationNotFoundForWorkforceError,
} from "./errors";
import type { DepartmentRepository, OrganizationDirectory } from "./ports";
import { departmentArchived, departmentCreated } from "./workforce-events";

export interface DepartmentServiceDeps {
  readonly repository: DepartmentRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for departments — the HR organizational tree. Creates departments (validating
 * the organization, a unique code, and any parent's existence, organization and acyclicity), drives
 * the `active → archived` lifecycle, and maintains the head / cost-centre / parent attributes.
 * Publishes the department created / archived events.
 */
export class DepartmentService {
  private readonly repository: DepartmentRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: DepartmentServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async create(input: CreateDepartmentParams): Promise<Department> {
    await this.assertOrganizationExists(input.tenantId, input.organizationId);
    await this.assertCodeFree(input.tenantId, input.code.trim());
    if (input.parentDepartmentId) {
      await this.assertParentValid(input.tenantId, input.parentDepartmentId, input.organizationId);
    }
    const department = createDepartment(input);
    await this.repository.save(department);
    await this.emit(departmentCreated(department));
    return department;
  }

  async rename(tenantId: TenantId, id: Uuid, name: string): Promise<Department> {
    return this.mutate(tenantId, id, (d) => renameDepartment(d, name));
  }

  async setCostCenter(
    tenantId: TenantId,
    id: Uuid,
    costCenter: string | null,
  ): Promise<Department> {
    return this.mutate(tenantId, id, (d) => setCostCenter(d, costCenter));
  }

  async setDescription(
    tenantId: TenantId,
    id: Uuid,
    description: string | null,
  ): Promise<Department> {
    return this.mutate(tenantId, id, (d) => setDepartmentDescription(d, description));
  }

  async assignHead(tenantId: TenantId, id: Uuid, headEmployeeId: Uuid | null): Promise<Department> {
    return this.mutate(tenantId, id, (d) => assignDepartmentHead(d, headEmployeeId));
  }

  async reparent(
    tenantId: TenantId,
    id: Uuid,
    parentDepartmentId: Uuid | null,
  ): Promise<Department> {
    const department = await this.require(tenantId, id);
    if (parentDepartmentId) {
      await this.assertParentValid(tenantId, parentDepartmentId, department.organizationId, id);
    }
    const updated = reparentDepartment(department, parentDepartmentId);
    await this.repository.save(updated);
    return updated;
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<Department> {
    const updated = archiveDepartment(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(departmentArchived(updated));
    return updated;
  }

  async reactivate(tenantId: TenantId, id: Uuid): Promise<Department> {
    return this.mutate(tenantId, id, reactivateDepartment);
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Department> {
    return this.require(tenantId, id);
  }

  async getByCode(tenantId: TenantId, code: string): Promise<Department> {
    const department = await this.repository.findByCode(tenantId, code);
    if (!department) {
      throw new DepartmentNotFoundError(code);
    }
    return department;
  }

  async list(tenantId: TenantId): Promise<Department[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Department[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  async listChildren(tenantId: TenantId, parentDepartmentId: Uuid): Promise<Department[]> {
    return this.repository.listByParent(tenantId, parentDepartmentId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (department: Department) => Department,
  ): Promise<Department> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async assertOrganizationExists(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForWorkforceError(organizationId);
    }
  }

  private async assertCodeFree(tenantId: TenantId, code: string): Promise<void> {
    if (await this.repository.findByCode(tenantId, code)) {
      throw new DuplicateDepartmentCodeError(code);
    }
  }

  /**
   * A parent must exist, belong to the same organization, and not create a cycle. `childId` is the
   * department being reparented (absent at create time, when the child does not yet exist).
   */
  private async assertParentValid(
    tenantId: TenantId,
    parentId: Uuid,
    organizationId: Uuid,
    childId?: Uuid,
  ): Promise<void> {
    if (childId && parentId === childId) {
      throw new DepartmentHierarchyError(childId, parentId);
    }
    const parent = await this.repository.findById(tenantId, parentId);
    if (!parent) {
      throw new DepartmentNotFoundError(parentId);
    }
    if (parent.organizationId !== organizationId) {
      throw new CrossOrganizationDepartmentError(childId ?? "(new)", parentId);
    }
    // Walk the parent's ancestor chain: reaching childId means the move forms a cycle.
    let cursor: Department | null = parent;
    const seen = new Set<string>();
    while (cursor) {
      if (childId && cursor.id === childId) {
        throw new DepartmentHierarchyError(childId, parentId);
      }
      if (cursor.parentDepartmentId === null || seen.has(cursor.id)) {
        break;
      }
      seen.add(cursor.id);
      cursor = await this.repository.findById(tenantId, cursor.parentDepartmentId);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Department> {
    const department = await this.repository.findById(tenantId, id);
    if (!department) {
      throw new DepartmentNotFoundError(id);
    }
    return department;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
