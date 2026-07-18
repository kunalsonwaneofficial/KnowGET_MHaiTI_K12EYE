import { SessionManager } from "@knowget/authentication";
import type { SecurityConfig } from "@knowget/security";
import type { TenantId } from "@knowget/types";
import type { RevocationStore } from "./persisted/revocation-store";
import type { SessionStore } from "./persisted/session-store";
import { tenantSessionRepository } from "./persisted/tenant-session.repository";

/** What the JWT guard extracts from a verified token to check live validity. */
export interface EnforcementInput {
  readonly sessionId?: string;
  readonly tokenId?: string;
  readonly familyId?: string;
  readonly tenantId?: string;
}

/**
 * A per-request check the JWT guard consults *after* verifying a token's
 * signature: is the referenced session still valid, and has the token (or its
 * family) been revoked? Injected `@Optional` — **absent in memory mode** (the
 * guard skips the check, so Phase-1 behaviour is unchanged) and **present in
 * persisted mode** (`SECURITY_STORE=persisted`).
 */
export interface SessionEnforcer {
  /** Resolve to `true` if the request may proceed, `false` to reject it (401). */
  enforce(input: EnforcementInput): Promise<boolean>;
}

/**
 * Persisted-mode {@link SessionEnforcer}. **Fail-closed**: a token carrying no
 * tenant or no session reference is rejected (persisted-issued tokens always
 * carry both). It validates the session against the persisted, tenant-scoped
 * store through the frozen `SessionManager` (idle + absolute timeout and the
 * revoked flag — unchanged), then rejects if the token id or its family has been
 * revoked. Reusing `SessionManager.validate` keeps the sliding-activity semantics
 * identical to login-time session handling.
 */
export class PersistedSessionEnforcer implements SessionEnforcer {
  constructor(
    private readonly sessions: SessionStore,
    private readonly revocations: RevocationStore,
    private readonly config: SecurityConfig,
  ) {}

  async enforce(input: EnforcementInput): Promise<boolean> {
    if (!input.tenantId || !input.sessionId) {
      return false;
    }
    const tenantId = input.tenantId as TenantId;

    const manager = new SessionManager(
      tenantSessionRepository(this.sessions, tenantId),
      this.config.session,
    );
    if (!(await manager.validate(input.sessionId))) {
      return false;
    }

    if (input.tokenId !== undefined || input.familyId !== undefined) {
      const revoked = await this.revocations.isRevoked(tenantId, {
        ...(input.tokenId !== undefined ? { tokenId: input.tokenId } : {}),
        ...(input.familyId !== undefined ? { familyId: input.familyId } : {}),
      });
      if (revoked) {
        return false;
      }
    }
    return true;
  }
}
