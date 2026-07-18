/**
 * End-to-end certification of the persisted security path (in-sandbox, in-memory
 * repositories standing in for the Prisma/RLS adapters): seed a bootstrap admin,
 * sign in (tenant-qualified), verify the issued token, resolve the principal from
 * the persisted stores, and authorize. This is exactly what `PersistedSecurityModule`
 * wires with the Prisma adapters in production.
 */
import { AuthorizationEngine, InMemoryRoleStore } from "@knowget/authorization";
import { InMemorySessionRepository, SessionManager } from "@knowget/authentication";
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
import { SecuritySeeder } from "./security-seeder";

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
      sessions: new SessionManager(new InMemorySessionRepository(), defaultSecurityConfig.session),
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
  });
});
