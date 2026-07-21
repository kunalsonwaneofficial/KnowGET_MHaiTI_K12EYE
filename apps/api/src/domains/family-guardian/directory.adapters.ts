import type {
  OrganizationDirectory,
  PersonDirectory,
  PolicyDirectory,
  StudentDirectory,
} from "@knowget/family-guardian";
import { PolicyNotFoundError, type PolicyService } from "@knowget/governance";
import { OrganizationNotFoundError, type OrganizationService } from "@knowget/organization";
import { PersonNotFoundError, type PersonService } from "@knowget/person";
import { StudentNotFoundError, type StudentService } from "@knowget/student-lifecycle";
import type { TenantId, Uuid } from "@knowget/types";

/**
 * {@link PersonDirectory} backed by the person service, so guardians and household
 * members can be required to be real Persons in the tenant without the pure
 * `@knowget/family-guardian` package depending on `@knowget/person`.
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

/** {@link OrganizationDirectory} backed by the organization service. */
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
 * {@link StudentDirectory} backed by the P2-D03 student service, so a student–guardian
 * relationship, consent or emergency contact can be required to reference a real
 * learner without depending on `@knowget/student-lifecycle` in the pure package.
 */
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

/**
 * {@link PolicyDirectory} backed by the P2-D02 governance policy service, so a consent
 * can be linked to a real policy without depending on `@knowget/governance` in the
 * pure package.
 */
export class PolicyServiceDirectory implements PolicyDirectory {
  constructor(private readonly policies: PolicyService) {}

  async exists(tenantId: TenantId, policyId: Uuid): Promise<boolean> {
    try {
      await this.policies.getById(tenantId, policyId);
      return true;
    } catch (error) {
      if (error instanceof PolicyNotFoundError) {
        return false;
      }
      throw error;
    }
  }
}
