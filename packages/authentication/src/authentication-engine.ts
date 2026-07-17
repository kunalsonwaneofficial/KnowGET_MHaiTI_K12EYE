import { PlatformError } from "@knowget/exceptions";
import {
  clearFailedAttempts,
  type Identity,
  type IdentityRepository,
  isLockedOut,
  lockIdentity,
  type LoginIdentifierType,
  recordFailedAttempt,
  verifyCredential,
} from "@knowget/identity";
import { type SecurityAuditLogger, type SecurityConfig } from "@knowget/security";
import { nowIso, toIso } from "@knowget/shared";
import { issueRefreshToken, signJwt } from "@knowget/tokens";
import type { Session, SessionManager } from "./session";

/** Raised for any authentication failure (maps to HTTP 401). */
export class AuthenticationError extends PlatformError {
  constructor(message = "Invalid credentials") {
    super(message, { code: "VALIDATION_ERROR", httpStatus: 401, isOperational: true });
  }
}

export interface AuthenticateInput {
  readonly type: LoginIdentifierType;
  readonly value: string;
  readonly password: string;
  readonly device?: string;
}

export interface AuthenticationResult {
  readonly identity: Identity;
  readonly session: Session;
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface AuthenticationDeps {
  readonly identities: IdentityRepository;
  readonly sessions: SessionManager;
  readonly audit: SecurityAuditLogger;
  readonly config: SecurityConfig;
  readonly signingKey: Buffer;
  readonly clock?: () => number;
}

/**
 * Orchestrates credential verification, account lockout, session creation and
 * token issuance, recording every outcome to the tamper-evident security audit.
 */
export class AuthenticationEngine {
  constructor(private readonly deps: AuthenticationDeps) {}

  async authenticate(input: AuthenticateInput): Promise<AuthenticationResult> {
    const { identities, sessions, audit, config, signingKey } = this.deps;
    const nowMs = (this.deps.clock ?? Date.now)();

    const identity = await identities.findByIdentifier(input.type, input.value);
    if (!identity) {
      audit.record({ type: "authentication.failed", detail: { identifier: input.value } });
      throw new AuthenticationError();
    }
    if (isLockedOut(identity, nowIso())) {
      audit.record({
        type: "authentication.failed",
        actorId: identity.id,
        detail: { reason: "locked" },
      });
      throw new AuthenticationError("Account is locked");
    }
    if (identity.status !== "active") {
      audit.record({
        type: "authentication.failed",
        actorId: identity.id,
        detail: { reason: "inactive" },
      });
      throw new AuthenticationError("Identity is not active");
    }

    if (!verifyCredential(input.password, identity.credentialHash)) {
      let updated = recordFailedAttempt(identity);
      if (updated.failedLoginAttempts >= config.login.maxFailedAttempts) {
        updated = lockIdentity(updated, toIso(new Date(nowMs + config.login.lockoutDurationMs)));
        audit.record({ type: "account.locked", actorId: identity.id });
      }
      await identities.save(updated);
      audit.record({
        type: "authentication.failed",
        actorId: identity.id,
        detail: { reason: "bad_password" },
      });
      throw new AuthenticationError();
    }

    const cleared = clearFailedAttempts(identity);
    await identities.save(cleared);

    const session = await sessions.create(
      cleared.id,
      input.device !== undefined ? { device: input.device } : {},
    );
    const accessToken = signJwt(
      { sub: cleared.id, sid: session.id },
      {
        key: signingKey,
        expiresInMs: config.token.accessTokenTtlMs,
        issuer: config.token.issuer,
        now: nowMs,
      },
    );
    const refresh = issueRefreshToken({ ttlMs: config.token.refreshTokenTtlMs, now: nowMs });

    audit.record({ type: "authentication.succeeded", actorId: cleared.id });
    audit.record({
      type: "session.created",
      actorId: cleared.id,
      detail: { sessionId: session.id },
    });

    return { identity: cleared, session, accessToken, refreshToken: refresh.token };
  }
}
