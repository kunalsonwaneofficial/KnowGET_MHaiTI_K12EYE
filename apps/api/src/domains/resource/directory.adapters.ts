import { OrganizationNotFoundError, type OrganizationService } from "@knowget/organization";
import type { EmployeeDirectory, OrganizationDirectory } from "@knowget/resource";
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
 * {@link EmployeeDirectory} backed by the workforce employee service (P2-D12). `exists` answers
 * presence; `organizationOf` resolves the employee's organization so a requisition derives its org from
 * the staff member who raised it and a custodian is validated — the employee is never duplicated here.
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
