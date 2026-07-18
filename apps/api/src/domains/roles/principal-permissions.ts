import type { Principal } from "@knowget/auth";
import type { TenantId } from "@knowget/types";
import type { PrincipalResolver } from "../../platform/security/principal-resolver";

/** Expands a set of role names into the permissions they grant, for a tenant. */
export type PermissionExpander = (tenantId: TenantId, roleNames: string[]) => Promise<string[]>;

/**
 * Decorates a {@link PrincipalResolver} so the resolved principal carries the
 * **permissions** its roles grant, resolved from the tenant's role catalogue
 * (P2-D01-M05). This closes the authorization loop: the membership-backed
 * resolver supplies role *names* (P2-D01-M04), and this decorator expands them
 * into permissions per tenant — data-driven, without touching the frozen
 * authorization engine (which unions `principal.permissions` at check time).
 *
 * Composing over the base resolver (rather than folding this into it) keeps the
 * membership resolver free of any dependency on the role catalogue.
 */
export function withResolvedPermissions(
  base: PrincipalResolver,
  expand: PermissionExpander,
): PrincipalResolver {
  return {
    async resolve(identityId: string): Promise<Principal | null> {
      const principal = await base.resolve(identityId);
      if (!principal || principal.tenantId === undefined) {
        return principal;
      }
      const permissions = await expand(principal.tenantId, [...principal.roles]);
      return { ...principal, permissions };
    },
  };
}
