import { PersonNotFoundError, type PersonService } from "@knowget/person";
import type { PersonDirectory } from "@knowget/relationship";
import type { TenantId, Uuid } from "@knowget/types";

/**
 * {@link PersonDirectory} backed by the person service, so the relationship
 * service can require both endpoints to be real people in the tenant without the
 * pure `@knowget/relationship` package depending on `@knowget/person`.
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
