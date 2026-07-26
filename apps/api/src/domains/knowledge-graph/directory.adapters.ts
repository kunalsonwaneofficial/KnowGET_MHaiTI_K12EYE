import type { OrganizationDirectory } from "@knowget/knowledge-graph";
import { OrganizationNotFoundError, type OrganizationService } from "@knowget/organization";
import type { TenantId, Uuid } from "@knowget/types";

/**
 * {@link OrganizationDirectory} backed by the organization service (P2-D01-M01). Every ontology and graph
 * record attaches to an organization node; the directory answers existence so the domain validates it without
 * depending on `@knowget/organization`. The knowledge graph references domain records (person, student, …) by
 * `sourceDomain`/`sourceRef` opaquely — only the owning organization is validated here.
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
