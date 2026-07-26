import type {
  EmployeeDirectory,
  OrganizationDirectory,
  PersonDirectory,
} from "@knowget/health-centre";
import { OrganizationNotFoundError, type OrganizationService } from "@knowget/organization";
import { PersonNotFoundError, type PersonService } from "@knowget/person";
import type { TenantId, Uuid } from "@knowget/types";
import { EmployeeNotFoundError, type EmployeeService } from "@knowget/workforce";

/** {@link OrganizationDirectory} backed by the organization service (P2-D01-M01). */
export class OrganizationServiceDirectory implements OrganizationDirectory {
  constructor(private readonly organizations: OrganizationService) {}

  async exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean> {
    try {
      await this.organizations.getById(tenantId, organizationId);
      return true;
    } catch (error) {
      if (error instanceof OrganizationNotFoundError) {
        return false;
      }
      throw error;
    }
  }
}

/**
 * {@link PersonDirectory} backed by the person service (P2-D01-M02). A patient is a Person (a student,
 * staff member, …); the directory answers existence so the domain validates the patient without
 * duplicating them — the health centre carries only the clinical operations, never the person record.
 */
export class PersonServiceDirectory implements PersonDirectory {
  constructor(private readonly persons: PersonService) {}

  async exists(tenantId: TenantId, personId: Uuid): Promise<boolean> {
    try {
      await this.persons.getById(tenantId, personId);
      return true;
    } catch (error) {
      if (error instanceof PersonNotFoundError) {
        return false;
      }
      throw error;
    }
  }
}

/**
 * {@link EmployeeDirectory} backed by the workforce employee service (P2-D12). `exists` answers presence;
 * `organizationOf` resolves the employee's organization so a clinician derives its org from the staff
 * member it links to — the employee is never duplicated here.
 */
export class EmployeeServiceDirectory implements EmployeeDirectory {
  constructor(private readonly employees: EmployeeService) {}

  async exists(tenantId: TenantId, employeeId: Uuid): Promise<boolean> {
    return (await this.organizationOf(tenantId, employeeId)) !== null;
  }

  async organizationOf(tenantId: TenantId, employeeId: Uuid): Promise<Uuid | null> {
    try {
      const employee = await this.employees.getById(tenantId, employeeId);
      return employee.organizationId;
    } catch (error) {
      if (error instanceof EmployeeNotFoundError) {
        return null;
      }
      throw error;
    }
  }
}
