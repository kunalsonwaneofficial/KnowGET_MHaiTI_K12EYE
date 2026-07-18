import { AuthenticationEngine, type SessionManager } from "@knowget/authentication";
import type { SecurityConfig } from "@knowget/security";

/** Credentials presented to sign in. `tenant` is required in persisted mode. */
export interface LoginInput {
  readonly email: string;
  readonly password: string;
  readonly device?: string;
  readonly tenant?: string;
}

/** The tokens issued on a successful sign-in. */
export interface LoginResult {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresInMs: number;
}

/** A request to end a session (sign out). `tokenId`/`tenant` come from the token
 * the caller presented; the persisted authenticator also records a revocation. */
export interface LogoutInput {
  readonly sessionId: string;
  readonly tokenId?: string;
  readonly tenant?: string;
}

/**
 * Exchanges credentials for tokens and ends sessions. Abstracts the difference
 * between the in-memory bootstrap (`EngineAuthenticator`) and the tenant-qualified
 * persisted store (`PersistedAuthenticator`), so the security controller is
 * mode-agnostic.
 */
export interface Authenticator {
  login(input: LoginInput): Promise<LoginResult>;
  logout(input: LogoutInput): Promise<void>;
}

/**
 * Memory-mode authenticator: delegates to the single bootstrap
 * {@link AuthenticationEngine} and returns its tokens unchanged (the `tenant`
 * input is ignored — the in-memory identity store is global). This preserves the
 * Phase-1 login behaviour exactly. Logout revokes the in-memory session.
 */
export class EngineAuthenticator implements Authenticator {
  constructor(
    private readonly engine: AuthenticationEngine,
    private readonly config: SecurityConfig,
    private readonly sessions: SessionManager,
  ) {}

  async login(input: LoginInput): Promise<LoginResult> {
    const result = await this.engine.authenticate({
      type: "email",
      value: input.email,
      password: input.password,
      ...(input.device !== undefined ? { device: input.device } : {}),
    });
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresInMs: this.config.token.accessTokenTtlMs,
    };
  }

  async logout(input: LogoutInput): Promise<void> {
    await this.sessions.revoke(input.sessionId);
  }
}
