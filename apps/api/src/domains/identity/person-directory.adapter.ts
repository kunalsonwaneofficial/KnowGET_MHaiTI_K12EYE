import type { PersonDirectory } from "@knowget/enterprise-identity";
import { PersonNotFoundError, type PersonService } from "@knowget/person";
import type { TenantId, Uuid } from "@knowget/types";

/**
 * {@link PersonDirectory} backed by the person domain's application service.
 * Lets the identity service enforce the Person↔account link (an account can only
 * be provisioned for a person that exists in the tenant) without the pure
 * `@knowget/enterprise-identity` package depending on `@knowget/person`.
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
