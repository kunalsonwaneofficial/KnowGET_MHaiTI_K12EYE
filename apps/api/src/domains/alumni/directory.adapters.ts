import type { OrganizationDirectory, PersonDirectory } from "@knowget/alumni";
import { OrganizationNotFoundError, type OrganizationService } from "@knowget/organization";
import { PersonNotFoundError, type PersonService } from "@knowget/person";
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

/**
 * {@link PersonDirectory} backed by the person service (P2-D01-M02). An alumnus is a Person; the directory
 * answers existence so the domain validates them without duplicating the person record. The
 * prospect/applicant/student/alumnus lifecycle record is Student Lifecycle's (P2-D03), referenced by id.
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
