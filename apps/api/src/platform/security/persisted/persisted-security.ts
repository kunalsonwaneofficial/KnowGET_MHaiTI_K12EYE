import type { SessionManager } from "@knowget/authentication";
import type { IdentityAccountRepository } from "@knowget/enterprise-identity";
import type { MembershipRepository } from "@knowget/membership";
import type { SecurityAuditLogger, SecurityConfig } from "@knowget/security";
import type { Authenticator } from "../authenticator";
import type { PrincipalResolver } from "../principal-resolver";
import { PersistedAuthenticator } from "./persisted-authenticator";
import {
  PersistedPrincipalResolver,
  type RolePermissionResolver,
} from "./persisted-principal-resolver";

export interface PersistedSecurityDeps {
  readonly accounts: IdentityAccountRepository;
  readonly memberships: MembershipRepository;
  readonly rolePermissions: RolePermissionResolver;
  readonly sessions: SessionManager;
  readonly audit: SecurityAuditLogger;
  readonly config: SecurityConfig;
  readonly signingKey: Buffer;
}

export interface PersistedSecurity {
  readonly authenticator: Authenticator;
  readonly principals: PrincipalResolver;
}

/**
 * Assemble the persisted security surfaces (tenant-qualified authenticator +
 * tenant-scoped principal resolver) from the domain ports. Pure composition:
 * with in-memory repositories it is fully testable in-sandbox; with the Prisma
 * adapters it is the production wiring (see `PersistedSecurityModule`).
 */
export function buildPersistedSecurity(deps: PersistedSecurityDeps): PersistedSecurity {
  return {
    authenticator: new PersistedAuthenticator(
      deps.accounts,
      deps.sessions,
      deps.audit,
      deps.config,
      deps.signingKey,
    ),
    principals: new PersistedPrincipalResolver(
      deps.accounts,
      deps.memberships,
      deps.rolePermissions,
    ),
  };
}
