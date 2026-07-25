import type {
  OrganizationDirectory,
  StudentDirectory,
  SubjectDirectory,
} from "@knowget/assessment-evaluation";
import { SubjectNotFoundError, type SubjectService } from "@knowget/academic-structure";
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

/** {@link SubjectDirectory} backed by the academic-structure subject service (P2-D06). */
export class SubjectServiceDirectory implements SubjectDirectory {
  constructor(private readonly subjects: SubjectService) {}

  async exists(tenantId: TenantId, subjectId: Uuid): Promise<boolean> {
    try {
      await this.subjects.getById(tenantId, subjectId);
      return true;
    } catch (error) {
      if (error instanceof SubjectNotFoundError) {
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
