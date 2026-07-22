import type { PersonDirectory, StudentDirectory } from "@knowget/learner-wellbeing";
import { PersonNotFoundError, type PersonService } from "@knowget/person";
import { StudentNotFoundError, type StudentService } from "@knowget/student-lifecycle";
import type { TenantId, Uuid } from "@knowget/types";

/**
 * {@link StudentDirectory} backed by the P2-D03 student service. Every wellbeing record
 * is about a Student and derives its organization from that Student, so this adapter
 * resolves the organization and validates existence in one call — returning null when
 * the learner does not exist — without the pure `@knowget/learner-wellbeing` package
 * depending on `@knowget/student-lifecycle`.
 */
export class StudentServiceDirectory implements StudentDirectory {
  constructor(private readonly students: StudentService) {}

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
 * {@link PersonDirectory} backed by the person service, so counsellors, reporters and
 * responsible staff can be required to be real Persons in the tenant without the pure
 * package depending on `@knowget/person`.
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
