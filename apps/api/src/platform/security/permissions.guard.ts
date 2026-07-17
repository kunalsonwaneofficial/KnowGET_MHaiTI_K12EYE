import { AuthorizationEngine, AuthorizationError } from "@knowget/authorization";
import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthenticatedRequest } from "./authenticated-request";
import { PERMISSIONS_KEY } from "./decorators";
import { AUTHORIZATION_ENGINE } from "./security.tokens";

/**
 * Enforces the permissions declared by {@link RequirePermissions} on a route.
 * Each required permission is evaluated as an action against the authenticated
 * {@link Principal} through the {@link AuthorizationEngine} (deny-policies →
 * RBAC → allow-policies → default-deny). Routes without the decorator pass
 * through untouched. A denial raises {@link AuthorizationError} (HTTP 403).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTHORIZATION_ENGINE) private readonly engine: AuthorizationEngine,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<readonly string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = request.principal;
    if (!principal) {
      throw new AuthorizationError("No authenticated principal");
    }

    for (const action of required) {
      this.engine.assert({ principal, action });
    }
    return true;
  }
}
