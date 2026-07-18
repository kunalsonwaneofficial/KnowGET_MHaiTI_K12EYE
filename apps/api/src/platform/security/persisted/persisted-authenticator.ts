import { createHash } from "node:crypto";
import {
  AuthenticationEngine,
  AuthenticationError,
  type Session,
  SessionManager,
} from "@knowget/authentication";
import type { IdentityAccountRepository } from "@knowget/enterprise-identity";
import { ValidationError } from "@knowget/exceptions";
import { type SecurityAuditLogger, type SecurityConfig, secureToken } from "@knowget/security";
import { issueRefreshToken, signJwt } from "@knowget/tokens";
import type { TenantId } from "@knowget/types";
import { tenantIdentityRepository } from "../../../domains/identity/identity-authentication.bridge";
import type { SessionValidityCache } from "../../keyvalue/session-cache";
import type {
  Authenticator,
  LoginInput,
  LoginResult,
  LogoutInput,
  RefreshInput,
} from "../authenticator";
import type { RefreshTokenStore } from "./refresh-token-store";
import type { RevocationStore } from "./revocation-store";
import type { SessionStore } from "./session-store";
import { tenantSessionRepository } from "./tenant-session.repository";

const sha256Hex = (value: string): string => createHash("sha256").update(value).digest("hex");

/**
 * Persisted-mode authenticator: **tenant-qualified** sign-in with a persisted,
 * **session-bound rotating refresh family** (TD-18).
 *
 * - **Login** runs the frozen {@link AuthenticationEngine} against the persisted
 *   identity + session stores, opens a refresh family bound to that session, and
 *   issues an access token carrying `sid`, `tenant`, `jti` and the family `fid`.
 * - **Refresh** rotates within the family: a presented token is looked up by hash,
 *   the session is re-validated (session-bound — a refresh cannot outlive the
 *   session's absolute timeout), the old token is consumed and a successor issued.
 *   Presenting an already-consumed token is a **replay** — the whole family and its
 *   session are revoked.
 * - **Logout** revokes the session, the presented token id, and the refresh family.
 */
export class PersistedAuthenticator implements Authenticator {
  constructor(
    private readonly accounts: IdentityAccountRepository,
    private readonly sessionStore: SessionStore,
    private readonly refreshTokens: RefreshTokenStore,
    private readonly revocations: RevocationStore,
    private readonly audit: SecurityAuditLogger,
    private readonly config: SecurityConfig,
    private readonly signingKey: Buffer,
    private readonly sessionCache?: SessionValidityCache,
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
    return this.issue(tenantId, result.identity.id, result.session);
  }

  async refresh(input: RefreshInput): Promise<LoginResult> {
    if (!input.tenant) {
      throw new ValidationError("A tenant is required to refresh");
    }
    const tenantId = input.tenant as TenantId;
    const record = await this.refreshTokens.findByHash(tenantId, sha256Hex(input.refreshToken));
    if (!record) {
      throw new AuthenticationError("Invalid refresh token");
    }
    if (record.expiresAt <= Date.now()) {
      throw new AuthenticationError("Refresh token has expired");
    }
    if (await this.revocations.isRevoked(tenantId, { familyId: record.familyId })) {
      throw new AuthenticationError("Refresh token family is revoked");
    }
    if (record.status !== "active") {
      // Reuse of a consumed token → token theft. Revoke the whole family and its
      // session so every credential in the lineage dies at once.
      await this.revocations.revoke(tenantId, "family", record.familyId);
      await this.sessionManager(tenantId).revoke(record.sessionId);
      await this.sessionCache?.invalidate(tenantId, record.sessionId);
      this.audit.record({
        type: "authentication.failed",
        actorId: record.identityId,
        detail: { reason: "refresh_replay", familyId: record.familyId },
      });
      throw new AuthenticationError("Refresh token reuse detected");
    }
    // Session-bound: the login session must still be valid (idle/absolute timeout,
    // not revoked). A dead session ends the refresh family.
    const session = await this.sessionManager(tenantId).validate(record.sessionId);
    if (!session) {
      throw new AuthenticationError("Session is no longer valid");
    }
    await this.refreshTokens.markRotated(tenantId, record.id);
    return this.issue(tenantId, record.identityId, session, record.familyId);
  }

  async logout(input: LogoutInput): Promise<void> {
    if (!input.tenant) {
      return;
    }
    const tenantId = input.tenant as TenantId;
    await this.sessionManager(tenantId).revoke(input.sessionId);
    await this.sessionCache?.invalidate(tenantId, input.sessionId);
    if (input.tokenId !== undefined) {
      await this.revocations.revoke(tenantId, "token", input.tokenId);
    }
    if (input.familyId !== undefined) {
      await this.revocations.revoke(tenantId, "family", input.familyId);
    }
  }

  /**
   * Issue the token pair for a session: persist a refresh token (in `familyId`, or
   * a new family at login) whose lifetime is capped at the session's absolute
   * expiry (session-bound), and sign an access token carrying the family `fid`.
   */
  private async issue(
    tenantId: TenantId,
    identityId: string,
    session: Session,
    familyId?: string,
  ): Promise<LoginResult> {
    const now = Date.now();
    const refresh = issueRefreshToken({
      ttlMs: this.config.token.refreshTokenTtlMs,
      now,
      ...(familyId !== undefined ? { familyId } : {}),
    });
    await this.refreshTokens.save(tenantId, {
      familyId: refresh.familyId,
      identityId,
      sessionId: session.id,
      tokenHash: refresh.tokenHash,
      issuedAt: now,
      // Session-bound: never outlive the session's absolute expiry.
      expiresAt: Math.min(refresh.expiresAt, session.expiresAt),
    });
    const accessToken = signJwt(
      {
        sub: identityId,
        sid: session.id,
        tenant: tenantId,
        jti: secureToken(16),
        fid: refresh.familyId,
      },
      {
        key: this.signingKey,
        expiresInMs: this.config.token.accessTokenTtlMs,
        issuer: this.config.token.issuer,
      },
    );
    return {
      accessToken,
      refreshToken: refresh.token,
      expiresInMs: this.config.token.accessTokenTtlMs,
    };
  }

  /** A frozen `SessionManager` bound to the persisted store for one tenant. */
  private sessionManager(tenantId: TenantId): SessionManager {
    return new SessionManager(
      tenantSessionRepository(this.sessionStore, tenantId),
      this.config.session,
    );
  }
}
