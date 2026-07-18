import type { Principal } from "@knowget/auth";
import type { SecurityConfig } from "@knowget/security";
import type { KeyRing } from "@knowget/security";
import { type JwtClaims, TokenError, verifyJwt } from "@knowget/tokens";
import type { Uuid } from "@knowget/types";
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Optional,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthenticatedRequest } from "./authenticated-request";
import { IS_PUBLIC_KEY } from "./decorators";
import type { PrincipalResolver } from "./principal-resolver";
import { KEY_RING, PRINCIPAL_RESOLVER, SECURITY_CONFIG, SESSION_ENFORCER } from "./security.tokens";
import type { SessionEnforcer } from "./session-enforcer";

const BEARER_PREFIX = "Bearer ";

/**
 * Authenticates a request from its `Authorization: Bearer <jwt>` header:
 * verifies the HS256 signature, expiry and issuer with the current signing key,
 * resolves the subject into a {@link Principal}, and attaches it to the request.
 * Routes marked with {@link Public} bypass the check. Any failure raises a
 * {@link TokenError} (HTTP 401) surfaced by the global exception filter.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(KEY_RING) private readonly keyRing: KeyRing,
    @Inject(SECURITY_CONFIG) private readonly config: SecurityConfig,
    @Inject(PRINCIPAL_RESOLVER) private readonly principals: PrincipalResolver,
    // Present only in persisted mode (SECURITY_STORE=persisted); absent in memory
    // mode, where the live session/revocation check is skipped (Phase-1 path).
    @Optional() @Inject(SESSION_ENFORCER) private readonly enforcer?: SessionEnforcer,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const claims = this.verify(this.extractToken(request));

    // The optional `tenant` claim (set by tenant-qualified login in persisted
    // mode) scopes the persisted principal resolver; the in-memory resolver
    // ignores it, so the default (memory) path is unchanged. `sid`/`jti`/`fid`
    // identify the session, token and refresh-family for live enforcement.
    const tenant = typeof claims.tenant === "string" ? claims.tenant : undefined;
    const sessionId = typeof claims.sid === "string" ? claims.sid : undefined;
    const tokenId = typeof claims.jti === "string" ? claims.jti : undefined;
    const familyId = typeof claims.fid === "string" ? claims.fid : undefined;

    // Persisted mode only: reject a token whose session has been revoked or has
    // lapsed, or whose id/family has been revoked. Absent in memory mode, so the
    // Phase-1 request path is unchanged.
    if (this.enforcer) {
      const allowed = await this.enforcer.enforce({
        sessionId,
        tokenId,
        familyId,
        tenantId: tenant,
      });
      if (!allowed) {
        throw new TokenError("Session is no longer valid");
      }
    }

    const resolved = await this.principals.resolve(claims.sub, tenant);
    // Authenticated but unassigned subjects proceed with zero authority so that
    // downstream permission checks default-deny (least privilege) rather than
    // failing open or rejecting identity outright. The `sub` is an opaque,
    // signed subject id — branding it as a Uuid here is a trust-boundary cast.
    const principal: Principal = resolved ?? {
      id: claims.sub as Uuid,
      roles: [],
      permissions: [],
    };

    request.principal = principal;
    request.auth = { principal, authenticatedAt: new Date((claims.iat ?? 0) * 1000).toISOString() };
    // Surfaced to the logout handler (via `@CurrentSession`) so it can revoke the
    // presented session/token. Only meaningful in persisted mode.
    request.tokenContext = {
      ...(sessionId !== undefined ? { sessionId } : {}),
      ...(tokenId !== undefined ? { tokenId } : {}),
      ...(familyId !== undefined ? { familyId } : {}),
      ...(tenant !== undefined ? { tenantId: tenant } : {}),
    };
    return true;
  }

  private extractToken(request: AuthenticatedRequest): string {
    const header = request.headers["authorization"];
    const value = Array.isArray(header) ? header[0] : header;
    if (!value || !value.startsWith(BEARER_PREFIX)) {
      throw new TokenError("Missing bearer token");
    }
    return value.slice(BEARER_PREFIX.length).trim();
  }

  private verify(token: string): JwtClaims {
    return verifyJwt(token, {
      key: this.keyRing.current().material,
      issuer: this.config.token.issuer,
    });
  }
}
