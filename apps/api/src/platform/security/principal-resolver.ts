import type { Principal } from "@knowget/auth";
import type { TenantId, Uuid } from "@knowget/types";

/**
 * Resolves an authenticated identity id (the JWT `sub`) into a full
 * {@link Principal} carrying its roles and permissions.
 *
 * This deliberately keeps authentication (proving *who* the caller is, done by
 * the signed token) separate from authorization (*what* they may do, resolved
 * here). Resolving roles server-side per request — rather than trusting role
 * claims embedded in a client-held token — means a revoked or changed role
 * takes effect immediately instead of lingering until the token expires.
 *
 * The in-memory implementation below is the P1-M04 bootstrap. Phase-2 identity
 * domains replace it with a tenant-scoped, database-backed assignment store
 * behind this same contract.
 */
export interface PrincipalResolver {
  /**
   * Resolve an authenticated subject into a {@link Principal}. `tenantId` (from
   * the token's tenant claim) is supplied by the guard and used by the persisted,
   * tenant-scoped resolver; the in-memory bootstrap resolver is identity-keyed and
   * ignores it.
   */
  resolve(identityId: string, tenantId?: string): Promise<Principal | null>;
}

/** A role/permission assignment for a single identity. */
export interface PrincipalAssignment {
  readonly identityId: Uuid;
  readonly tenantId?: TenantId;
  readonly roles: readonly string[];
  readonly permissions?: readonly string[];
}

export class InMemoryPrincipalResolver implements PrincipalResolver {
  private readonly assignments = new Map<string, PrincipalAssignment>();

  constructor(assignments: readonly PrincipalAssignment[] = []) {
    for (const assignment of assignments) {
      this.assignments.set(assignment.identityId, assignment);
    }
  }

  assign(assignment: PrincipalAssignment): void {
    this.assignments.set(assignment.identityId, assignment);
  }

  async resolve(identityId: string): Promise<Principal | null> {
    const assignment = this.assignments.get(identityId);
    if (!assignment) {
      return null;
    }
    return {
      id: assignment.identityId,
      ...(assignment.tenantId !== undefined ? { tenantId: assignment.tenantId } : {}),
      roles: assignment.roles,
      permissions: assignment.permissions ?? [],
    };
  }
}
