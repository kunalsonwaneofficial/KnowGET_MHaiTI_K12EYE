import type { OrganizationDirectory } from "@knowget/academic-structure";
import { OrganizationNotFoundError, type OrganizationService } from "@knowget/organization";
import type { TenantId, Uuid } from "@knowget/types";

/**
 * {@link OrganizationDirectory} backed by the organization service (P2-D01-M01), so every
 * academic-structure record can be required to belong to a real Organization without the
 * pure `@knowget/academic-structure` package depending on `@knowget/organization`.
 */
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
