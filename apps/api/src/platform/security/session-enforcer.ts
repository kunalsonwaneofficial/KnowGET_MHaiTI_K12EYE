import { SessionManager } from "@knowget/authentication";
import type { SecurityConfig } from "@knowget/security";
import type { TenantId } from "@knowget/types";
import type { SessionValidityCache } from "../keyvalue/session-cache";
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
 * tenant or no session reference is rejected. It validates the session against the
 * persisted, tenant-scoped store through the frozen `SessionManager` (idle +
 * absolute timeout and the revoked flag), then rejects if the token id or its
 * family has been revoked.
 *
 * With an optional {@link SessionValidityCache} (TD-22), a recently-validated
 * session skips the session-store validate (a write-transaction) — the read-through
 * fast path. Revocation is still checked on every request, so logout/replay (which
 * revoke the family) stay prompt; only the rare max-concurrent eviction is bounded
 * by the short cache TTL.
 */
export class PersistedSessionEnforcer implements SessionEnforcer {
  constructor(
    private readonly sessions: SessionStore,
    private readonly revocations: RevocationStore,
    private readonly config: SecurityConfig,
    private readonly cache?: SessionValidityCache,
  ) {}

  async enforce(input: EnforcementInput): Promise<boolean> {
    if (!input.tenantId || !input.sessionId) {
      return false;
    }
    const tenantId = input.tenantId as TenantId;

    const cached = this.cache ? await this.cache.isValid(tenantId, input.sessionId) : false;
    if (!cached) {
      const manager = new SessionManager(
        tenantSessionRepository(this.sessions, tenantId),
        this.config.session,
      );
      if (!(await manager.validate(input.sessionId))) {
        return false;
      }
      if (this.cache) {
        await this.cache.markValid(tenantId, input.sessionId);
      }
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
