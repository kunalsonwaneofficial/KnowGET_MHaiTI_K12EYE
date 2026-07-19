import { MembershipNotFoundError, type MembershipService } from "@knowget/membership";
import { OrganizationNotFoundError, type OrganizationService } from "@knowget/organization";
import { PersonNotFoundError, type PersonService } from "@knowget/person";
import type {
  MembershipDirectory,
  OrganizationDirectory,
  PersonDirectory,
} from "@knowget/student-lifecycle";
import type { TenantId, Uuid } from "@knowget/types";

/**
 * {@link PersonDirectory} backed by the person service, so the lifecycle can require
 * that every learner is a real Person in the tenant without the pure
 * `@knowget/student-lifecycle` package depending on `@knowget/person`.
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
 * {@link MembershipDirectory} backed by the membership service, so a student can be
 * linked to an existing institutional Membership rather than duplicating it.
 */
export class MembershipServiceDirectory implements MembershipDirectory {
  constructor(private readonly memberships: MembershipService) {}

  async exists(tenantId: TenantId, membershipId: Uuid): Promise<boolean> {
    try {
      await this.memberships.getById(tenantId, membershipId);
      return true;
    } catch (error) {
      if (error instanceof MembershipNotFoundError) {
        return false;
      }
      throw error;
    }
  }
}
