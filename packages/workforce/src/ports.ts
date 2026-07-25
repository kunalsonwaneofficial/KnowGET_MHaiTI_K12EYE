import type { TenantId, Uuid } from "@knowget/types";
import type { Department } from "./department";
import type { Employee } from "./employee";
import type { EmploymentContract } from "./employment-contract";
import type { Position } from "./position";

/**
 * Read model over the organization domain (P2-D01-M01): does this organization node
 * (campus / institution) exist in the tenant? Departments and employees attach to it.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/**
 * Read model over the person domain (P2-D01-M02): does this person exist in the tenant? Every
 * employee is a Person; the workforce domain links to it and never depends on `@knowget/person`.
 */
export interface PersonDirectory {
  exists(tenantId: TenantId, personId: Uuid): Promise<boolean>;
}

/** Storage contract for departments. Tenant-scoped (explicit argument + RLS). */
export interface DepartmentRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Department | null>;
  findByCode(tenantId: TenantId, code: string): Promise<Department | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Department[]>;
  listByParent(tenantId: TenantId, parentDepartmentId: Uuid): Promise<Department[]>;
  listByTenant(tenantId: TenantId): Promise<Department[]>;
  save(department: Department): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link DepartmentRepository} — the default for tests and bootstrap. */
export class InMemoryDepartmentRepository implements DepartmentRepository {
  private readonly byId = new Map<string, Department>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Department | null> {
    const department = this.byId.get(id);
    return department && department.tenantId === tenantId ? department : null;
  }

  async findByCode(tenantId: TenantId, code: string): Promise<Department | null> {
    return [...this.byId.values()].find((d) => d.tenantId === tenantId && d.code === code) ?? null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Department[]> {
    return [...this.byId.values()].filter(
      (d) => d.tenantId === tenantId && d.organizationId === organizationId,
    );
  }

  async listByParent(tenantId: TenantId, parentDepartmentId: Uuid): Promise<Department[]> {
    return [...this.byId.values()].filter(
      (d) => d.tenantId === tenantId && d.parentDepartmentId === parentDepartmentId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Department[]> {
    return [...this.byId.values()].filter((d) => d.tenantId === tenantId);
  }

  async save(department: Department): Promise<void> {
    this.byId.set(department.id, department);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const department = this.byId.get(id);
    if (department && department.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for positions. Tenant-scoped (explicit argument + RLS). */
export interface PositionRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Position | null>;
  findByCode(tenantId: TenantId, code: string): Promise<Position | null>;
  listByDepartment(tenantId: TenantId, departmentId: Uuid): Promise<Position[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Position[]>;
  listByTenant(tenantId: TenantId): Promise<Position[]>;
  save(position: Position): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link PositionRepository} — the default for tests and bootstrap. */
export class InMemoryPositionRepository implements PositionRepository {
  private readonly byId = new Map<string, Position>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Position | null> {
    const position = this.byId.get(id);
    return position && position.tenantId === tenantId ? position : null;
  }

  async findByCode(tenantId: TenantId, code: string): Promise<Position | null> {
    return [...this.byId.values()].find((p) => p.tenantId === tenantId && p.code === code) ?? null;
  }

  async listByDepartment(tenantId: TenantId, departmentId: Uuid): Promise<Position[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.departmentId === departmentId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Position[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Position[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(position: Position): Promise<void> {
    this.byId.set(position.id, position);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const position = this.byId.get(id);
    if (position && position.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for employees. Tenant-scoped (explicit argument + RLS). */
export interface EmployeeRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Employee | null>;
  findByEmployeeNumber(tenantId: TenantId, employeeNumber: string): Promise<Employee | null>;
  listByPerson(tenantId: TenantId, personId: Uuid): Promise<Employee[]>;
  listByDepartment(tenantId: TenantId, departmentId: Uuid): Promise<Employee[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Employee[]>;
  listByTenant(tenantId: TenantId): Promise<Employee[]>;
  save(employee: Employee): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link EmployeeRepository} — the default for tests and bootstrap. */
export class InMemoryEmployeeRepository implements EmployeeRepository {
  private readonly byId = new Map<string, Employee>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Employee | null> {
    const employee = this.byId.get(id);
    return employee && employee.tenantId === tenantId ? employee : null;
  }

  async findByEmployeeNumber(tenantId: TenantId, employeeNumber: string): Promise<Employee | null> {
    return (
      [...this.byId.values()].find(
        (e) => e.tenantId === tenantId && e.employeeNumber === employeeNumber,
      ) ?? null
    );
  }

  async listByPerson(tenantId: TenantId, personId: Uuid): Promise<Employee[]> {
    return [...this.byId.values()].filter(
      (e) => e.tenantId === tenantId && e.personId === personId,
    );
  }

  async listByDepartment(tenantId: TenantId, departmentId: Uuid): Promise<Employee[]> {
    return [...this.byId.values()].filter(
      (e) => e.tenantId === tenantId && e.departmentId === departmentId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Employee[]> {
    return [...this.byId.values()].filter(
      (e) => e.tenantId === tenantId && e.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Employee[]> {
    return [...this.byId.values()].filter((e) => e.tenantId === tenantId);
  }

  async save(employee: Employee): Promise<void> {
    this.byId.set(employee.id, employee);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const employee = this.byId.get(id);
    if (employee && employee.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for employment contracts. Tenant-scoped (explicit argument + RLS). */
export interface EmploymentContractRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<EmploymentContract | null>;
  findActiveByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<EmploymentContract | null>;
  listByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<EmploymentContract[]>;
  listByTenant(tenantId: TenantId): Promise<EmploymentContract[]>;
  save(contract: EmploymentContract): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link EmploymentContractRepository} — the default for tests and bootstrap. */
export class InMemoryEmploymentContractRepository implements EmploymentContractRepository {
  private readonly byId = new Map<string, EmploymentContract>();

  async findById(tenantId: TenantId, id: Uuid): Promise<EmploymentContract | null> {
    const contract = this.byId.get(id);
    return contract && contract.tenantId === tenantId ? contract : null;
  }

  async findActiveByEmployee(
    tenantId: TenantId,
    employeeId: Uuid,
  ): Promise<EmploymentContract | null> {
    return (
      [...this.byId.values()].find(
        (c) => c.tenantId === tenantId && c.employeeId === employeeId && c.status === "active",
      ) ?? null
    );
  }

  async listByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<EmploymentContract[]> {
    return [...this.byId.values()].filter(
      (c) => c.tenantId === tenantId && c.employeeId === employeeId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<EmploymentContract[]> {
    return [...this.byId.values()].filter((c) => c.tenantId === tenantId);
  }

  async save(contract: EmploymentContract): Promise<void> {
    this.byId.set(contract.id, contract);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const contract = this.byId.get(id);
    if (contract && contract.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
