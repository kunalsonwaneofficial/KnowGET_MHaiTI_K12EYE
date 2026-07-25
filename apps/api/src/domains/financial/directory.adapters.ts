import type {
  EmployeeCompensationDirectory,
  EmployeeEarnings,
  OrganizationDirectory,
  PayComponentInput,
  StudentDirectory,
} from "@knowget/financial";
import { OrganizationNotFoundError, type OrganizationService } from "@knowget/organization";
import { StudentNotFoundError, type StudentService } from "@knowget/student-lifecycle";
import type { TenantId, Uuid } from "@knowget/types";
import {
  EmployeeNotFoundError,
  type EmployeeService,
  type EmploymentContractService,
} from "@knowget/workforce";

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
 * {@link StudentDirectory} backed by the student-lifecycle student service (P2-D03). `exists` answers
 * presence; `organizationOf` resolves the student's organization so an invoice or concession derives
 * its org from the student it bills — the student is never duplicated here.
 */
export class StudentServiceDirectory implements StudentDirectory {
  constructor(private readonly students: StudentService) {}

  async exists(tenantId: TenantId, studentId: Uuid): Promise<boolean> {
    return (await this.organizationOf(tenantId, studentId)) !== null;
  }

  async organizationOf(tenantId: TenantId, studentId: Uuid): Promise<Uuid | null> {
    try {
      const student = await this.students.getById(tenantId, studentId);
      return student.organizationId;
    } catch (error) {
      if (error instanceof StudentNotFoundError) {
        return null;
      }
      throw error;
    }
  }
}

/**
 * The institution's pay scale — a map from an employment-contract pay grade/band label to the earning
 * lines (and currency) that band pays. This is the Financial platform's salary structure: the
 * workforce domain (P2-D12) deliberately records only the grade *label* and defers the money to here.
 * It is supplied as configuration; a grade with no entry has no derivable earnings.
 */
export type PayScale = Readonly<
  Record<string, { readonly currency: string; readonly components: readonly PayComponentInput[] }>
>;

/**
 * {@link EmployeeCompensationDirectory} backed by the workforce employee and contract services
 * (P2-D12) plus the Financial pay scale. `organizationOf` resolves the employee's organization;
 * `baseEarnings` reads the employee's active contract's pay grade/band label and turns it into the
 * concrete earning lines the configured scale assigns to that band — the crossing where a workforce
 * grade becomes real money. Returns `null` when the employee, an active contract, its grade, or a
 * scale entry for that grade is absent.
 */
export class EmployeeCompensationServiceDirectory implements EmployeeCompensationDirectory {
  constructor(
    private readonly employees: EmployeeService,
    private readonly contracts: EmploymentContractService,
    private readonly payScale: PayScale,
  ) {}

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

  async baseEarnings(tenantId: TenantId, employeeId: Uuid): Promise<EmployeeEarnings | null> {
    if ((await this.organizationOf(tenantId, employeeId)) === null) {
      return null;
    }
    const contract = await this.contracts.getActiveForEmployee(tenantId, employeeId);
    const grade = contract?.grade ?? null;
    if (grade === null) {
      return null;
    }
    const band = this.payScale[grade];
    return band ? { currency: band.currency, components: band.components } : null;
  }
}
