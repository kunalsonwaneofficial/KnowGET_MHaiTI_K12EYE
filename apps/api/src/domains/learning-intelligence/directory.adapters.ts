import type { OrganizationDirectory, StudentDirectory } from "@knowget/learning-intelligence";
import { OrganizationNotFoundError, type OrganizationService } from "@knowget/organization";
import { StudentNotFoundError, type StudentService } from "@knowget/student-lifecycle";
import type { TenantId, Uuid } from "@knowget/types";

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

/** {@link StudentDirectory} backed by the student-lifecycle student service (P2-D03). */
export class StudentServiceDirectory implements StudentDirectory {
  constructor(private readonly students: StudentService) {}

  async exists(tenantId: TenantId, studentId: Uuid): Promise<boolean> {
    try {
      await this.students.getById(tenantId, studentId);
      return true;
    } catch (error) {
      if (error instanceof StudentNotFoundError) {
        return false;
      }
      throw error;
    }
  }
}
