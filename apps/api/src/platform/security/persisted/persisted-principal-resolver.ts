import type { Principal } from "@knowget/auth";
import type { IdentityAccountRepository } from "@knowget/enterprise-identity";
import type { MembershipRepository } from "@knowget/membership";
import type { TenantId, Uuid } from "@knowget/types";
import { tenantPrincipalResolver } from "../../../domains/membership/membership-principal-resolver";
import { withResolvedPermissions } from "../../../domains/roles/principal-permissions";
import type { PrincipalResolver } from "../principal-resolver";

/** Expands a tenant's role names into the permissions they grant. */
export type RolePermissionResolver = (tenantId: TenantId, roleNames: string[]) => Promise<string[]>;

/**
 * Persisted, tenant-scoped {@link PrincipalResolver}. Given the authenticated
 * account id and the tenant (from the token's tenant claim), it composes the
 * membership-backed principal resolver (roles) with the role-catalogue permission
 * decorator (permissions) — the same seams certified in P2-D01-M07. Without a
 * tenant it resolves nothing (persisted resolution is tenant-qualified).
 */
export class PersistedPrincipalResolver implements PrincipalResolver {
  constructor(
    private readonly accounts: IdentityAccountRepository,
    private readonly memberships: MembershipRepository,
    private readonly rolePermissions: RolePermissionResolver,
  ) {}

  async resolve(identityId: string, tenantId?: string): Promise<Principal | null> {
    if (!tenantId) {
      return null;
    }
    const base = tenantPrincipalResolver(this.accounts, this.memberships, tenantId as TenantId);
    const resolver = withResolvedPermissions(base, this.rolePermissions);
    return resolver.resolve(identityId as Uuid);
  }
}
