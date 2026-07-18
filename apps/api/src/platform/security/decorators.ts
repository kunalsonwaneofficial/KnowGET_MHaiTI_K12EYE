import type { Principal } from "@knowget/auth";
import { createParamDecorator, type ExecutionContext, SetMetadata } from "@nestjs/common";
import type { AuthenticatedRequest } from "./authenticated-request";

/** Marks a route (or controller) as not requiring authentication. */
export const IS_PUBLIC_KEY = "security:isPublic";
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/** Declares the permissions a caller must hold to invoke a route. */
export const PERMISSIONS_KEY = "security:permissions";
export const RequirePermissions = (
  ...permissions: readonly string[]
): MethodDecorator & ClassDecorator => SetMetadata(PERMISSIONS_KEY, permissions);

/** Per-route rate-limit override (falls back to the global default otherwise). */
export const RATE_LIMIT_KEY = "security:rateLimit";
export interface RateLimitMetadata {
  readonly windowMs: number;
  readonly max: number;
}
export const RateLimit = (options: RateLimitMetadata): MethodDecorator & ClassDecorator =>
  SetMetadata(RATE_LIMIT_KEY, options);

/**
 * Injects the authenticated {@link Principal} attached by {@link JwtAuthGuard}.
 * Optionally projects a single field, e.g. `@CurrentPrincipal('id')`.
 */
export const CurrentPrincipal = createParamDecorator(
  (field: keyof Principal | undefined, ctx: ExecutionContext): Principal | unknown => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = request.principal;
    if (!principal) {
      return undefined;
    }
    return field ? principal[field] : principal;
  },
);

/** The session/token references from the verified token, populated by the guard. */
export interface SessionContext {
  readonly sessionId?: string;
  readonly tokenId?: string;
  readonly familyId?: string;
  readonly tenantId?: string;
}

/**
 * Injects the {@link SessionContext} (session id, token id, tenant) the
 * {@link JwtAuthGuard} extracted from the presented token — used by the logout
 * handler to revoke that session. Empty in memory mode (tokens carry no session
 * references there).
 */
export const CurrentSession = createParamDecorator(
  (_field: unknown, ctx: ExecutionContext): SessionContext => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.tokenContext ?? {};
  },
);
