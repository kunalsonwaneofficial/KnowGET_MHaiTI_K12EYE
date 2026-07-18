import type { Principal } from "@knowget/auth";
import type { IdentityAccountRepository } from "@knowget/enterprise-identity";
import { isActiveMembership, type MembershipRepository } from "@knowget/membership";
import type { TenantId, Uuid } from "@knowget/types";
import type { PrincipalResolver } from "../../platform/security/principal-resolver";

/**
 * A **persisted, tenant-scoped** {@link PrincipalResolver} — the membership
 * domain's contribution to resolving TD-16 (the in-memory principal→role store).
 *
 * Given an authenticated identity-account id (the JWT `sub`), it resolves the
 * owning person and unions the role names from that person's **active**
 * memberships into a {@link Principal}. Permissions are intentionally left empty:
 * the `AuthorizationEngine` expands role names into permissions at check time via
 * the role store, so the resolver only needs to supply the role *names*.
 *
 * Login is **tenant-qualified** (the tenant is resolved before the account is
 * looked up), so the resolver is constructed bound to a tenant — mirroring the
 * enterprise-identity auth bridge (P2-D01-M03) — which keeps every query
 * RLS-clean.
 */
export function tenantPrincipalResolver(
  accounts: IdentityAccountRepository,
  memberships: MembershipRepository,
  tenantId: TenantId,
): PrincipalResolver {
  return {
    async resolve(identityId: string): Promise<Principal | null> {
      const account = await accounts.findById(tenantId, identityId as Uuid);
      if (!account) {
        return null;
      }
      const roles = new Set<string>();
      for (const membership of await memberships.findByPerson(tenantId, account.personId)) {
        if (isActiveMembership(membership)) {
          for (const role of membership.roles) {
            roles.add(role);
          }
        }
      }
      return { id: identityId as Uuid, tenantId, roles: [...roles], permissions: [] };
    },
  };
}
