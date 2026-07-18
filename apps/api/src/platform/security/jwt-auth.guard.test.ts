import { defaultSecurityConfig, KeyRing } from "@knowget/security";
import { signJwt, TokenError } from "@knowget/tokens";
import type { TenantId, Uuid } from "@knowget/types";
import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import type { AuthenticatedRequest } from "./authenticated-request";
import { IS_PUBLIC_KEY } from "./decorators";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { InMemoryPrincipalResolver, type PrincipalResolver } from "./principal-resolver";

const CONFIG = defaultSecurityConfig;
const SUBJECT = "11111111-1111-1111-1111-111111111111" as Uuid;
const TENANT = "22222222-2222-2222-2222-222222222222" as TenantId;

function stubReflector(meta: Record<string, unknown>): Reflector {
  return { getAllAndOverride: (key: string) => meta[key] } as unknown as Reflector;
}

function context(request: AuthenticatedRequest): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
  } as unknown as ExecutionContext;
}

function makeGuard(meta: Record<string, unknown>, keyRing: KeyRing): JwtAuthGuard {
  const resolver = new InMemoryPrincipalResolver([
    { identityId: SUBJECT, roles: ["administrator"], permissions: ["admin:read"] },
  ]);
  return new JwtAuthGuard(stubReflector(meta), keyRing, CONFIG, resolver);
}

function bearer(token: string): AuthenticatedRequest {
  return { headers: { authorization: `Bearer ${token}` } };
}

describe("JwtAuthGuard", () => {
  it("allows public routes without a token", async () => {
    const guard = makeGuard({ [IS_PUBLIC_KEY]: true }, new KeyRing());
    await expect(guard.canActivate(context({ headers: {} }))).resolves.toBe(true);
  });

  it("rejects a request with no bearer token", async () => {
    const guard = makeGuard({ [IS_PUBLIC_KEY]: false }, new KeyRing());
    await expect(guard.canActivate(context({ headers: {} }))).rejects.toBeInstanceOf(TokenError);
  });

  it("rejects a token signed with a different key", async () => {
    const guard = makeGuard({ [IS_PUBLIC_KEY]: false }, new KeyRing());
    const forged = signJwt(
      { sub: SUBJECT },
      { key: new KeyRing().current().material, issuer: CONFIG.token.issuer },
    );
    await expect(guard.canActivate(context(bearer(forged)))).rejects.toBeInstanceOf(TokenError);
  });

  it("attaches the resolved principal for a valid token", async () => {
    const keyRing = new KeyRing();
    const guard = makeGuard({ [IS_PUBLIC_KEY]: false }, keyRing);
    const token = signJwt(
      { sub: SUBJECT },
      { key: keyRing.current().material, issuer: CONFIG.token.issuer, expiresInMs: 60_000 },
    );
    const request = bearer(token);
    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(request.principal?.id).toBe(SUBJECT);
    expect(request.principal?.roles).toEqual(["administrator"]);
    expect(request.auth?.authenticatedAt).toBeTypeOf("string");
  });

  it("passes the token's tenant claim to the resolver (persisted mode)", async () => {
    const keyRing = new KeyRing();
    const seen: Array<string | undefined> = [];
    const resolver: PrincipalResolver = {
      resolve: async (id, tenantId) => {
        seen.push(tenantId);
        return {
          id: id as Uuid,
          ...(tenantId ? { tenantId: tenantId as TenantId } : {}),
          roles: ["teacher"],
          permissions: ["student.read"],
        };
      },
    };
    const guard = new JwtAuthGuard(
      stubReflector({ [IS_PUBLIC_KEY]: false }),
      keyRing,
      CONFIG,
      resolver,
    );
    const token = signJwt(
      { sub: SUBJECT, tenant: TENANT },
      { key: keyRing.current().material, issuer: CONFIG.token.issuer },
    );
    const request = bearer(token);
    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(seen).toEqual([TENANT]);
    expect(request.principal?.tenantId).toBe(TENANT);
  });

  it("admits an authenticated-but-unassigned subject with zero authority", async () => {
    const keyRing = new KeyRing();
    const guard = new JwtAuthGuard(
      stubReflector({ [IS_PUBLIC_KEY]: false }),
      keyRing,
      CONFIG,
      new InMemoryPrincipalResolver(),
    );
    const token = signJwt(
      { sub: "unknown-subject" },
      { key: keyRing.current().material, issuer: CONFIG.token.issuer },
    );
    const request = bearer(token);
    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(request.principal).toEqual({ id: "unknown-subject", roles: [], permissions: [] });
  });
});
