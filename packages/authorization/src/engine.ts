import type { Principal } from "@knowget/auth";
import { PlatformError } from "@knowget/exceptions";
import type { AuthorizationDecision, AuthorizationRequest, Policy, PolicyContext } from "./model";
import type { RoleStore } from "./role-store";

const WILDCARD = "*";

/** Raised when an authorization check fails (maps to HTTP 403). */
export class AuthorizationError extends PlatformError {
  constructor(reason: string) {
    super(reason, { code: "VALIDATION_ERROR", httpStatus: 403, isOperational: true });
  }
}

/**
 * Deterministic authorization engine. Order of evaluation: explicit deny
 * policies win, then RBAC permissions grant, then allow policies (ABAC), then
 * default-deny.
 */
export class AuthorizationEngine {
  constructor(
    private readonly roleStore: RoleStore,
    private readonly policies: readonly Policy[] = [],
  ) {}

  /** All permissions a principal holds directly and via its roles. */
  effectivePermissions(principal: Principal): Set<string> {
    const permissions = new Set<string>(principal.permissions);
    for (const roleName of principal.roles) {
      const role = this.roleStore.getRole(roleName);
      if (role) {
        for (const permission of role.permissions) {
          permissions.add(permission);
        }
      }
    }
    return permissions;
  }

  evaluate(request: AuthorizationRequest): AuthorizationDecision {
    const context: PolicyContext = {
      principal: request.principal,
      action: request.action,
      resource: request.resource,
      attributes: request.attributes ?? {},
    };

    for (const policy of this.policies) {
      if (policy.effect === "deny" && policy.matches(context)) {
        return { allowed: false, effect: "deny", reason: `Denied by policy: ${policy.name}` };
      }
    }

    const permissions = this.effectivePermissions(request.principal);
    if (permissions.has(WILDCARD) || permissions.has(request.action)) {
      return { allowed: true, effect: "allow", reason: "Granted by role/permission" };
    }

    for (const policy of this.policies) {
      if (policy.effect === "allow" && policy.matches(context)) {
        return { allowed: true, effect: "allow", reason: `Allowed by policy: ${policy.name}` };
      }
    }

    return { allowed: false, effect: "deny", reason: "No matching grant (default deny)" };
  }

  /** Evaluate and throw {@link AuthorizationError} when denied. */
  assert(request: AuthorizationRequest): void {
    const decision = this.evaluate(request);
    if (!decision.allowed) {
      throw new AuthorizationError(decision.reason);
    }
  }
}
