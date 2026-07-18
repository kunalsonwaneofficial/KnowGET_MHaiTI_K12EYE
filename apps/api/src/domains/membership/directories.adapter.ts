import type { OrganizationDirectory, PersonDirectory, RoleDirectory } from "@knowget/membership";
import { OrganizationNotFoundError, type OrganizationService } from "@knowget/organization";
import { PersonNotFoundError, type PersonService } from "@knowget/person";
import type { RoleService } from "@knowget/roles";
import type { TenantId, Uuid } from "@knowget/types";

/**
 * {@link PersonDirectory} backed by the person service. Lets the membership
 * service enforce that a membership targets a real person in the tenant without
 * the pure `@knowget/membership` package depending on `@knowget/person`.
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

/** {@link RoleDirectory} backed by the role catalogue service (P2-D01-M05). */
export class RoleServiceDirectory implements RoleDirectory {
  constructor(private readonly roles: RoleService) {}

  roleExists(tenantId: TenantId, roleName: string): Promise<boolean> {
    return this.roles.roleExists(tenantId, roleName);
  }
}
