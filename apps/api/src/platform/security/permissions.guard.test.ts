import { AuthorizationEngine, AuthorizationError, InMemoryRoleStore } from "@knowget/authorization";
import type { Principal } from "@knowget/auth";
import type { Uuid } from "@knowget/types";
import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import type { AuthenticatedRequest } from "./authenticated-request";
import { PermissionsGuard } from "./permissions.guard";

const engine = new AuthorizationEngine(
  new InMemoryRoleStore([{ name: "administrator", permissions: ["*"] }]),
);

const admin: Principal = {
  id: "1" as Uuid,
  roles: ["administrator"],
  permissions: [],
};
const guest: Principal = { id: "2" as Uuid, roles: [], permissions: [] };

function stubReflector(required: readonly string[] | undefined): Reflector {
  return { getAllAndOverride: () => required } as unknown as Reflector;
}

function context(request: AuthenticatedRequest): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe("PermissionsGuard", () => {
  it("passes routes that declare no permissions", () => {
    const guard = new PermissionsGuard(stubReflector(undefined), engine);
    expect(guard.canActivate(context({ headers: {}, principal: guest }))).toBe(true);
  });

  it("passes an empty permission list", () => {
    const guard = new PermissionsGuard(stubReflector([]), engine);
    expect(guard.canActivate(context({ headers: {}, principal: guest }))).toBe(true);
  });

  it("grants a principal that holds the required permission (via wildcard role)", () => {
    const guard = new PermissionsGuard(stubReflector(["admin:read"]), engine);
    expect(guard.canActivate(context({ headers: {}, principal: admin }))).toBe(true);
  });

  it("denies a principal lacking the required permission", () => {
    const guard = new PermissionsGuard(stubReflector(["admin:read"]), engine);
    expect(() => guard.canActivate(context({ headers: {}, principal: guest }))).toThrow(
      AuthorizationError,
    );
  });

  it("denies when no principal is present", () => {
    const guard = new PermissionsGuard(stubReflector(["admin:read"]), engine);
    expect(() => guard.canActivate(context({ headers: {} }))).toThrow(AuthorizationError);
  });
});
