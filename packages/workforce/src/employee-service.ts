import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  activateEmployee,
  assignEmployeeDepartment,
  assignEmployeePosition,
  type Employee,
  giveNotice,
  isEmployeeOnStaff,
  makeEmployeeAlumni,
  type OnboardEmployeeParams,
  onboardEmployee,
  placeEmployeeOnLeave,
  reinstateEmployee,
  resignEmployee,
  retireEmployee,
  returnEmployeeFromLeave,
  setEmployeeEmploymentType,
  suspendEmployee,
  terminateEmployee,
} from "./employee";
import {
  CrossOrganizationAssignmentError,
  DepartmentNotFoundError,
  DuplicateEmployeeNumberError,
  DuplicateEmploymentError,
  EmployeeNotFoundError,
  OrganizationNotFoundForWorkforceError,
  PersonNotFoundForWorkforceError,
  PositionNotFoundError,
} from "./errors";
import type {
  DepartmentRepository,
  EmployeeRepository,
  OrganizationDirectory,
  PersonDirectory,
  PositionRepository,
} from "./ports";
import type { EmploymentType } from "./workforce-value";
import {
  employeeActivated,
  employeeBecameAlumni,
  employeeOnboarded,
  employeeSeparated,
} from "./workforce-events";

export interface EmployeeServiceDeps {
  readonly repository: EmployeeRepository;
  readonly persons: PersonDirectory;
  readonly organizations: OrganizationDirectory;
  readonly departments: DepartmentRepository;
  readonly positions: PositionRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for employees — the heart of the workforce, the HR analog of the student
 * service. Onboards staff (validating the organization, the Person, any department/position link,
 * a unique employee number, and a single active employment per institution) and drives the
 * `onboarding → active → … → alumni` lifecycle, publishing the employee events. Never duplicates
 * identity: the employee is a Person.
 */
export class EmployeeService {
  private readonly repository: EmployeeRepository;
  private readonly persons: PersonDirectory;
  private readonly organizations: OrganizationDirectory;
  private readonly departments: DepartmentRepository;
  private readonly positions: PositionRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: EmployeeServiceDeps) {
    this.repository = deps.repository;
    this.persons = deps.persons;
    this.organizations = deps.organizations;
    this.departments = deps.departments;
    this.positions = deps.positions;
    this.events = deps.events;
  }

  async onboard(input: OnboardEmployeeParams): Promise<Employee> {
    await this.assertOrganizationExists(input.tenantId, input.organizationId);
    await this.assertPersonExists(input.tenantId, input.personId);
    await this.assertEmployeeNumberFree(input.tenantId, input.employeeNumber.trim());
    await this.assertNoActiveEmployment(input.tenantId, input.personId, input.organizationId);
    if (input.departmentId) {
      await this.assertDepartmentInOrg(input.tenantId, input.departmentId, input.organizationId);
    }
    if (input.positionId) {
      await this.assertPositionInOrg(input.tenantId, input.positionId, input.organizationId);
    }
    const employee = onboardEmployee(input);
    await this.repository.save(employee);
    await this.emit(employeeOnboarded(employee));
    return employee;
  }

  async activate(tenantId: TenantId, id: Uuid): Promise<Employee> {
    const updated = activateEmployee(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(employeeActivated(updated));
    return updated;
  }

  async placeOnLeave(tenantId: TenantId, id: Uuid): Promise<Employee> {
    return this.mutate(tenantId, id, placeEmployeeOnLeave);
  }

  async returnFromLeave(tenantId: TenantId, id: Uuid): Promise<Employee> {
    return this.mutate(tenantId, id, returnEmployeeFromLeave);
  }

  async suspend(tenantId: TenantId, id: Uuid): Promise<Employee> {
    return this.mutate(tenantId, id, suspendEmployee);
  }

  async reinstate(tenantId: TenantId, id: Uuid): Promise<Employee> {
    return this.mutate(tenantId, id, reinstateEmployee);
  }

  async giveNotice(tenantId: TenantId, id: Uuid): Promise<Employee> {
    return this.mutate(tenantId, id, giveNotice);
  }

  async resign(tenantId: TenantId, id: Uuid, exitDate?: string | null): Promise<Employee> {
    return this.separate(tenantId, id, (e) => resignEmployee(e, exitDate));
  }

  async terminate(tenantId: TenantId, id: Uuid, exitDate?: string | null): Promise<Employee> {
    return this.separate(tenantId, id, (e) => terminateEmployee(e, exitDate));
  }

  async retire(tenantId: TenantId, id: Uuid, exitDate?: string | null): Promise<Employee> {
    return this.separate(tenantId, id, (e) => retireEmployee(e, exitDate));
  }

  async becomeAlumni(tenantId: TenantId, id: Uuid): Promise<Employee> {
    const updated = makeEmployeeAlumni(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(employeeBecameAlumni(updated));
    return updated;
  }

  async assignDepartment(
    tenantId: TenantId,
    id: Uuid,
    departmentId: Uuid | null,
  ): Promise<Employee> {
    const employee = await this.require(tenantId, id);
    if (departmentId) {
      await this.assertDepartmentInOrg(tenantId, departmentId, employee.organizationId);
    }
    return this.save(assignEmployeeDepartment(employee, departmentId));
  }

  async assignPosition(tenantId: TenantId, id: Uuid, positionId: Uuid | null): Promise<Employee> {
    const employee = await this.require(tenantId, id);
    if (positionId) {
      await this.assertPositionInOrg(tenantId, positionId, employee.organizationId);
    }
    return this.save(assignEmployeePosition(employee, positionId));
  }

  async setEmploymentType(
    tenantId: TenantId,
    id: Uuid,
    employmentType: EmploymentType,
  ): Promise<Employee> {
    return this.mutate(tenantId, id, (e) => setEmployeeEmploymentType(e, employmentType));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Employee> {
    return this.require(tenantId, id);
  }

  async getByEmployeeNumber(tenantId: TenantId, employeeNumber: string): Promise<Employee> {
    const employee = await this.repository.findByEmployeeNumber(tenantId, employeeNumber);
    if (!employee) {
      throw new EmployeeNotFoundError(employeeNumber);
    }
    return employee;
  }

  async list(tenantId: TenantId): Promise<Employee[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Employee[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  async listForDepartment(tenantId: TenantId, departmentId: Uuid): Promise<Employee[]> {
    return this.repository.listByDepartment(tenantId, departmentId);
  }

  async listForPerson(tenantId: TenantId, personId: Uuid): Promise<Employee[]> {
    return this.repository.listByPerson(tenantId, personId);
  }

  private async separate(
    tenantId: TenantId,
    id: Uuid,
    fn: (employee: Employee) => Employee,
  ): Promise<Employee> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(employeeSeparated(updated));
    return updated;
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (employee: Employee) => Employee,
  ): Promise<Employee> {
    return this.save(fn(await this.require(tenantId, id)));
  }

  private async save(employee: Employee): Promise<Employee> {
    await this.repository.save(employee);
    return employee;
  }

  private async assertOrganizationExists(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForWorkforceError(organizationId);
    }
  }

  private async assertPersonExists(tenantId: TenantId, personId: Uuid): Promise<void> {
    if (!(await this.persons.exists(tenantId, personId))) {
      throw new PersonNotFoundForWorkforceError(personId);
    }
  }

  private async assertEmployeeNumberFree(
    tenantId: TenantId,
    employeeNumber: string,
  ): Promise<void> {
    if (await this.repository.findByEmployeeNumber(tenantId, employeeNumber)) {
      throw new DuplicateEmployeeNumberError(employeeNumber);
    }
  }

  private async assertNoActiveEmployment(
    tenantId: TenantId,
    personId: Uuid,
    organizationId: Uuid,
  ): Promise<void> {
    const existing = await this.repository.listByPerson(tenantId, personId);
    if (existing.some((e) => e.organizationId === organizationId && isEmployeeOnStaff(e))) {
      throw new DuplicateEmploymentError(personId);
    }
  }

  private async assertDepartmentInOrg(
    tenantId: TenantId,
    departmentId: Uuid,
    organizationId: Uuid,
  ): Promise<void> {
    const department = await this.departments.findById(tenantId, departmentId);
    if (!department) {
      throw new DepartmentNotFoundError(departmentId);
    }
    if (department.organizationId !== organizationId) {
      throw new CrossOrganizationAssignmentError("department", departmentId);
    }
  }

  private async assertPositionInOrg(
    tenantId: TenantId,
    positionId: Uuid,
    organizationId: Uuid,
  ): Promise<void> {
    const position = await this.positions.findById(tenantId, positionId);
    if (!position) {
      throw new PositionNotFoundError(positionId);
    }
    if (position.organizationId !== organizationId) {
      throw new CrossOrganizationAssignmentError("position", positionId);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Employee> {
    const employee = await this.repository.findById(tenantId, id);
    if (!employee) {
      throw new EmployeeNotFoundError(id);
    }
    return employee;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
