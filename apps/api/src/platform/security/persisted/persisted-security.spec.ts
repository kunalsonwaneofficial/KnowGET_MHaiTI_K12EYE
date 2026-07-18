/**
 * End-to-end certification of the persisted security path (in-sandbox, in-memory
 * repositories standing in for the Prisma/RLS adapters): seed a bootstrap admin,
 * sign in (tenant-qualified), verify the issued token, resolve the principal from
 * the persisted stores, and authorize. This is exactly what `PersistedSecurityModule`
 * wires with the Prisma adapters in production.
 */
import { AuthorizationEngine, InMemoryRoleStore } from "@knowget/authorization";
import {
  IdentityAccountService,
  InMemoryIdentityAccountRepository,
  type PersonDirectory as IdentityPersonDirectory,
} from "@knowget/enterprise-identity";
import {
  InMemoryMembershipRepository,
  MembershipService,
  type OrganizationDirectory,
  type PersonDirectory as MembershipPersonDirectory,
  type RoleDirectory,
} from "@knowget/membership";
import { InMemoryOrganizationRepository, OrganizationService } from "@knowget/organization";
import { InMemoryPersonRepository, PersonService } from "@knowget/person";
import { InMemoryRoleRepository, RoleService } from "@knowget/roles";
import { defaultSecurityConfig, hashPassword, SecurityAuditLogger } from "@knowget/security";
import { verifyJwt } from "@knowget/tokens";
import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { buildPersistedSecurity } from "./persisted-security";
import { InMemoryRefreshTokenStore } from "./refresh-token-store";
import { InMemoryRevocationStore } from "./revocation-store";
import { SecuritySeeder } from "./security-seeder";
import { InMemorySessionStore } from "./session-store";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ADMIN = { tenantId: TENANT, email: "admin@knowget.local", password: "ChangeMe!Bootstrap1" };
const SIGNING_KEY = Buffer.from("persisted-security-signing-secret-32by");

describe("persisted security — end to end", () => {
  it("seeds an admin, then login -> token -> principal -> authorize succeeds", async () => {
    const accounts = new InMemoryIdentityAccountRepository();
    const memberRepo = new InMemoryMembershipRepository();
    const persons = new PersonService(new InMemoryPersonRepository());
    const organizations = new OrganizationService(new InMemoryOrganizationRepository());
    const roles = new RoleService({ repository: new InMemoryRoleRepository() });

    const personExists = async (tenantId: TenantId, personId: Uuid): Promise<boolean> => {
      try {
        await persons.getById(tenantId, personId);
        return true;
      } catch {
        return false;
      }
    };
    const identityPersons: IdentityPersonDirectory = { exists: personExists };
    const membershipPersons: MembershipPersonDirectory = { exists: personExists };
    const organizationsDir: OrganizationDirectory = {
      exists: async (tenantId, id) => {
        try {
          await organizations.getById(tenantId, id);
          return true;
        } catch {
          return false;
        }
      },
    };
    const rolesDir: RoleDirectory = { roleExists: (t, name) => roles.roleExists(t, name) };

    const identities = new IdentityAccountService({
      repository: accounts,
      persons: identityPersons,
      hasher: { hash: (p) => hashPassword(p) },
    });
    const memberships = new MembershipService({
      repository: memberRepo,
      persons: membershipPersons,
      organizations: organizationsDir,
      roles: rolesDir,
    });

    // Seed the bootstrap administrator.
    await new SecuritySeeder({
      persons,
      organizations,
      roles,
      identities,
      memberships,
      accounts,
    }).seed(ADMIN);

    // Assemble the persisted security surfaces from the shared repositories.
    const security = buildPersistedSecurity({
      accounts,
      memberships: memberRepo,
      rolePermissions: (tenantId, names) => roles.permissionsForRoleNames(tenantId, names),
      sessionStore: new InMemorySessionStore(),
      refreshTokens: new InMemoryRefreshTokenStore(),
      revocations: new InMemoryRevocationStore(),
      audit: new SecurityAuditLogger(),
      config: defaultSecurityConfig,
      signingKey: SIGNING_KEY,
    });
    const authz = new AuthorizationEngine(new InMemoryRoleStore([]));

    // Tenant-qualified login → token with a tenant claim.
    const login = await security.authenticator.login({
      tenant: TENANT,
      email: ADMIN.email,
      password: ADMIN.password,
    });
    const claims = verifyJwt(login.accessToken, {
      key: SIGNING_KEY,
      issuer: defaultSecurityConfig.token.issuer,
    });
    expect(claims.tenant).toBe(TENANT);

    // Guard-style resolution: sub + tenant claim → Principal.
    const principal = await security.principals.resolve(
      claims.sub,
      typeof claims.tenant === "string" ? claims.tenant : undefined,
    );
    expect(principal?.roles).toEqual(["administrator"]);
    expect(principal?.permissions).toEqual(["*"]);

    // The administrator's wildcard grants any action.
    expect(principal).not.toBeNull();
    if (principal) {
      expect(authz.evaluate({ principal, action: "anything.at.all" }).allowed).toBe(true);
      expect(() => authz.assert({ principal, action: "finance.write" })).not.toThrow();
    }

    // Live enforcement + refresh rotation + replay defense, end to end.
    const sid = typeof claims.sid === "string" ? claims.sid : undefined;
    const jti = typeof claims.jti === "string" ? claims.jti : undefined;
    const fid = typeof claims.fid === "string" ? claims.fid : undefined;
    const tenant = typeof claims.tenant === "string" ? claims.tenant : undefined;
    expect(
      await security.enforcer.enforce({ sessionId: sid, tokenId: jti, tenantId: tenant }),
    ).toBe(true);

    // Rotate: a fresh access token for the same session is accepted by the guard.
    const refreshed = await security.authenticator.refresh({
      tenant: TENANT,
      refreshToken: login.refreshToken,
    });
    const refreshedClaims = verifyJwt(refreshed.accessToken, {
      key: SIGNING_KEY,
      issuer: defaultSecurityConfig.token.issuer,
    });
    expect(refreshedClaims.sid).toBe(sid); // session-bound
    expect(
      await security.enforcer.enforce({
        sessionId: refreshedClaims.sid as string,
        tokenId: refreshedClaims.jti as string,
        familyId: refreshedClaims.fid as string,
        tenantId: tenant,
      }),
    ).toBe(true);

    // Replay the consumed login token → the family (and its session) are revoked,
    // and the guard now rejects any token bearing that family.
    await expect(
      security.authenticator.refresh({ tenant: TENANT, refreshToken: login.refreshToken }),
    ).rejects.toThrow();
    expect(
      await security.enforcer.enforce({ sessionId: sid, familyId: fid, tenantId: tenant }),
    ).toBe(false);
  });
});
