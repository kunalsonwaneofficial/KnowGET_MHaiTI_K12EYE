import type { OrganizationDirectory } from "@knowget/agent-orchestration";
import { OrganizationNotFoundError, type OrganizationService } from "@knowget/organization";
import type { TenantId, Uuid } from "@knowget/types";

/**
 * {@link OrganizationDirectory} backed by the organization service (P2-D01-M01). Every agent, capability, plan,
 * approval, invocation and reasoning session hangs off an organization node; the directory answers existence so
 * the AI runtime validates it without depending on `@knowget/organization`. This is the only reach the domain
 * has outside its own records, and it is a read model rather than a dependency — the reason a domain package
 * never imports another domain package.
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
