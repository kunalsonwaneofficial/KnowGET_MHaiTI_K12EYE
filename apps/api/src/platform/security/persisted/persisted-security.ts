import type { IdentityAccountRepository } from "@knowget/enterprise-identity";
import type { MembershipRepository } from "@knowget/membership";
import type { SecurityAuditLogger, SecurityConfig } from "@knowget/security";
import type { Authenticator } from "../authenticator";
import type { PrincipalResolver } from "../principal-resolver";
import { PersistedSessionEnforcer, type SessionEnforcer } from "../session-enforcer";
import { PersistedAuthenticator } from "./persisted-authenticator";
import {
  PersistedPrincipalResolver,
  type RolePermissionResolver,
} from "./persisted-principal-resolver";
import type { RefreshTokenStore } from "./refresh-token-store";
import type { RevocationStore } from "./revocation-store";
import type { SessionStore } from "./session-store";

export interface PersistedSecurityDeps {
  readonly accounts: IdentityAccountRepository;
  readonly memberships: MembershipRepository;
  readonly rolePermissions: RolePermissionResolver;
  readonly sessionStore: SessionStore;
  readonly refreshTokens: RefreshTokenStore;
  readonly revocations: RevocationStore;
  readonly audit: SecurityAuditLogger;
  readonly config: SecurityConfig;
  readonly signingKey: Buffer;
}

export interface PersistedSecurity {
  readonly authenticator: Authenticator;
  readonly principals: PrincipalResolver;
  readonly enforcer: SessionEnforcer;
}

/**
 * Assemble the persisted security surfaces from the domain + store ports:
 * a tenant-qualified authenticator (login + logout over the persisted session and
 * revocation stores), a tenant-scoped principal resolver, and the per-request
 * session enforcer the guard consults. Pure composition: with in-memory stores it
 * is fully testable in-sandbox; with the Prisma adapters it is the production
 * wiring (see `PersistedSecurityModule`).
 */
export function buildPersistedSecurity(deps: PersistedSecurityDeps): PersistedSecurity {
  return {
    authenticator: new PersistedAuthenticator(
      deps.accounts,
      deps.sessionStore,
      deps.refreshTokens,
      deps.revocations,
      deps.audit,
      deps.config,
      deps.signingKey,
    ),
    principals: new PersistedPrincipalResolver(
      deps.accounts,
      deps.memberships,
      deps.rolePermissions,
    ),
    enforcer: new PersistedSessionEnforcer(deps.sessionStore, deps.revocations, deps.config),
  };
}
