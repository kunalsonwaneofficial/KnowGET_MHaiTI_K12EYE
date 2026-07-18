import { AuthenticationEngine, SessionManager } from "@knowget/authentication";
import type { IdentityAccountRepository } from "@knowget/enterprise-identity";
import { ValidationError } from "@knowget/exceptions";
import { type SecurityAuditLogger, type SecurityConfig, secureToken } from "@knowget/security";
import { signJwt } from "@knowget/tokens";
import type { TenantId } from "@knowget/types";
import { tenantIdentityRepository } from "../../../domains/identity/identity-authentication.bridge";
import type { Authenticator, LoginInput, LoginResult, LogoutInput } from "../authenticator";
import type { RevocationStore } from "./revocation-store";
import type { SessionStore } from "./session-store";
import { tenantSessionRepository } from "./tenant-session.repository";

/**
 * Persisted-mode authenticator: **tenant-qualified** sign-in. The tenant is
 * resolved before the account lookup (from the sign-in request), so the frozen
 * {@link AuthenticationEngine} runs against the persisted, tenant-scoped identity
 * store (via the M03 identity bridge) **and** creates its session in the
 * persisted, tenant-scoped {@link SessionStore}. The issued access token carries
 * a **`tenant` claim** (scoping the principal resolver) and a **`jti` claim** (so
 * a specific token can be revoked). Logout revokes the session and records the
 * token id as revoked — both taking effect on the next request via the guard's
 * session enforcer.
 */
export class PersistedAuthenticator implements Authenticator {
  constructor(
    private readonly accounts: IdentityAccountRepository,
    private readonly sessionStore: SessionStore,
    private readonly revocations: RevocationStore,
    private readonly audit: SecurityAuditLogger,
    private readonly config: SecurityConfig,
    private readonly signingKey: Buffer,
  ) {}

  async login(input: LoginInput): Promise<LoginResult> {
    if (!input.tenant) {
      throw new ValidationError("A tenant is required to sign in");
    }
    const tenantId = input.tenant as TenantId;
    const engine = new AuthenticationEngine({
      identities: tenantIdentityRepository(this.accounts, tenantId),
      sessions: this.sessionManager(tenantId),
      audit: this.audit,
      config: this.config,
      signingKey: this.signingKey,
    });
    const result = await engine.authenticate({
      type: "email",
      value: input.email,
      password: input.password,
      ...(input.device !== undefined ? { device: input.device } : {}),
    });
    const tokenId = secureToken(16);
    const accessToken = signJwt(
      { sub: result.identity.id, sid: result.session.id, tenant: tenantId, jti: tokenId },
      {
        key: this.signingKey,
        expiresInMs: this.config.token.accessTokenTtlMs,
        issuer: this.config.token.issuer,
      },
    );
    return {
      accessToken,
      refreshToken: result.refreshToken,
      expiresInMs: this.config.token.accessTokenTtlMs,
    };
  }

  async logout(input: LogoutInput): Promise<void> {
    if (!input.tenant) {
      return;
    }
    const tenantId = input.tenant as TenantId;
    await this.sessionManager(tenantId).revoke(input.sessionId);
    if (input.tokenId !== undefined) {
      await this.revocations.revoke(tenantId, "token", input.tokenId);
    }
  }

  /** A frozen `SessionManager` bound to the persisted store for one tenant. */
  private sessionManager(tenantId: TenantId): SessionManager {
    return new SessionManager(
      tenantSessionRepository(this.sessionStore, tenantId),
      this.config.session,
    );
  }
}
