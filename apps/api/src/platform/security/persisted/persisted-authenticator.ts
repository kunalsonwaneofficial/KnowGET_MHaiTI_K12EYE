import { AuthenticationEngine, type SessionManager } from "@knowget/authentication";
import type { IdentityAccountRepository } from "@knowget/enterprise-identity";
import { ValidationError } from "@knowget/exceptions";
import type { SecurityAuditLogger, SecurityConfig } from "@knowget/security";
import { signJwt } from "@knowget/tokens";
import type { TenantId } from "@knowget/types";
import { tenantIdentityRepository } from "../../../domains/identity/identity-authentication.bridge";
import type { Authenticator, LoginInput, LoginResult } from "../authenticator";

/**
 * Persisted-mode authenticator: **tenant-qualified** sign-in. The tenant is
 * resolved before the account lookup (from the sign-in request), so the frozen
 * {@link AuthenticationEngine} runs against the persisted, tenant-scoped identity
 * store via the identity bridge (RLS-clean). The issued access token carries a
 * **`tenant` claim** so the guard can scope the tenant-aware principal resolver.
 * Sessions, lockout and audit are the engine's — unchanged.
 */
export class PersistedAuthenticator implements Authenticator {
  constructor(
    private readonly accounts: IdentityAccountRepository,
    private readonly sessions: SessionManager,
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
      sessions: this.sessions,
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
    const accessToken = signJwt(
      { sub: result.identity.id, sid: result.session.id, tenant: tenantId },
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
}
