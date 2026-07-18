/**
 * Identity & Organization sub-domain certification (P2-D01-M07).
 *
 * This suite composes ALL SIX domains of the sub-domain end to end — Organization
 * (M01), Person (M02), Enterprise Identity (M03), Membership (M04), Roles /
 * Authorization (M05) and Relationship (M06) — with the real P1-M04
 * authentication and authorization engines, and certifies the full chain that
 * makes the platform work:
 *
 *   organization + person + role + identity account + membership + relationship
 *     → login (AuthenticationEngine via the identity bridge)
 *     → resolve Principal (membership resolver + role-permission decorator)
 *     → authorize (AuthorizationEngine, allow + default-deny)
 *
 * It uses the in-memory repository implementations of each domain's port. Those
 * ports are the same ones the Prisma/RLS adapters implement (CI-verified per
 * TD-12), so this certifies the *composition and semantics*; per-table RLS is
 * certified separately against live PostgreSQL (see the certification report).
 */
import type { Principal } from "@knowget/auth";
import {
  AuthenticationEngine,
  InMemorySessionRepository,
  SessionManager,
} from "@knowget/authentication";
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
import {
  counterpart,
  InMemoryRelationshipRepository,
  type PersonDirectory as RelationshipPersonDirectory,
  RelationshipService,
} from "@knowget/relationship";
import { InMemoryRoleRepository, RoleService } from "@knowget/roles";
import { defaultSecurityConfig, hashPassword, SecurityAuditLogger } from "@knowget/security";
import type { TenantId, Uuid } from "@knowget/types";
import { beforeEach, describe, expect, it } from "vitest";
import { tenantIdentityRepository } from "../domains/identity/identity-authentication.bridge";
import { tenantPrincipalResolver } from "../domains/membership/membership-principal-resolver";
import { withResolvedPermissions } from "../domains/roles/principal-permissions";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const OTHER_TENANT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as TenantId;
const PASSWORD = "correct horse battery staple";
const SIGNING_KEY = Buffer.from("certification-signing-secret-please-32");

interface World {
  readonly accounts: InMemoryIdentityAccountRepository;
  readonly memberships: InMemoryMembershipRepository;
  readonly roles: RoleService;
  readonly relationships: RelationshipService;
  readonly membershipService: MembershipService;
  readonly auth: AuthenticationEngine;
  readonly authz: AuthorizationEngine;
  readonly accountId: Uuid;
  readonly teacherMembershipId: Uuid;
  readonly teacherRoleId: Uuid;
  readonly guardianId: Uuid;
  readonly studentId: Uuid;
  readonly relationshipId: Uuid;
}

/** Resolve a Principal for the teacher's account through the certified composition. */
async function resolve(world: World): Promise<Principal> {
  const resolver = withResolvedPermissions(
    tenantPrincipalResolver(world.accounts, world.memberships, TENANT),
    (tenantId, names) => world.roles.permissionsForRoleNames(tenantId, names),
  );
  const principal = await resolver.resolve(world.accountId);
  if (!principal) {
    throw new Error("expected the account to resolve to a principal");
  }
  return principal;
}

/** Build the whole sub-domain from scratch with in-memory repositories. */
async function build(): Promise<World> {
  const accounts = new InMemoryIdentityAccountRepository();
  const memberships = new InMemoryMembershipRepository();

  const organizations = new OrganizationService(new InMemoryOrganizationRepository());
  const persons = new PersonService(new InMemoryPersonRepository());
  const roles = new RoleService({ repository: new InMemoryRoleRepository() });

  // Directory adapters over the real services (as the API wires them).
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
  const relationshipPersons: RelationshipPersonDirectory = { exists: personExists };
  const organizationsDir: OrganizationDirectory = {
    exists: async (tenantId, organizationId) => {
      try {
        await organizations.getById(tenantId, organizationId);
        return true;
      } catch {
        return false;
      }
    },
  };
  const rolesDir: RoleDirectory = {
    roleExists: (tenantId, name) => roles.roleExists(tenantId, name),
  };

  const identities = new IdentityAccountService({
    repository: accounts,
    persons: identityPersons,
    hasher: { hash: (plaintext) => hashPassword(plaintext) },
  });
  const membershipService = new MembershipService({
    repository: memberships,
    persons: membershipPersons,
    organizations: organizationsDir,
    roles: rolesDir,
  });
  const relationships = new RelationshipService({
    repository: new InMemoryRelationshipRepository(),
    persons: relationshipPersons,
  });

  // Populate the institution.
  const school = await organizations.create({
    tenantId: TENANT,
    type: "school",
    name: "Ada Institute",
    code: "ADA",
  });
  const teacher = await persons.register({
    tenantId: TENANT,
    name: { given: "Grace", family: "Hopper" },
  });
  const student = await persons.register({
    tenantId: TENANT,
    name: { given: "Ada", family: "Lovelace" },
    dateOfBirth: "2012-05-01",
  });
  const guardian = await persons.register({
    tenantId: TENANT,
    name: { given: "Augusta", family: "King" },
  });
  const teacherRole = await roles.define({
    tenantId: TENANT,
    name: "teacher",
    permissions: ["student.read", "attendance.write"],
  });
  const account = await identities.provision({
    tenantId: TENANT,
    personId: teacher.id,
    identifiers: [{ type: "email", value: "grace@ada.institute" }],
    password: PASSWORD,
    activate: true,
  });
  const membership = await membershipService.grant({
    tenantId: TENANT,
    personId: teacher.id,
    organizationId: school.id,
    roles: ["teacher"],
  });
  const relationship = await relationships.relate({
    tenantId: TENANT,
    fromPersonId: guardian.id,
    toPersonId: student.id,
    kind: "guardian",
  });

  const auth = new AuthenticationEngine({
    identities: tenantIdentityRepository(accounts, TENANT),
    sessions: new SessionManager(new InMemorySessionRepository(), defaultSecurityConfig.session),
    audit: new SecurityAuditLogger(),
    config: defaultSecurityConfig,
    signingKey: SIGNING_KEY,
  });
  const authz = new AuthorizationEngine(new InMemoryRoleStore([]));

  return {
    accounts,
    memberships,
    roles,
    relationships,
    membershipService,
    auth,
    authz,
    accountId: account.id,
    teacherMembershipId: membership.id,
    teacherRoleId: teacherRole.id,
    guardianId: guardian.id,
    studentId: student.id,
    relationshipId: relationship.id,
  };
}

describe("Identity & Organization sub-domain certification", () => {
  let world: World;
  beforeEach(async () => {
    world = await build();
  });

  it("certifies the full chain: login -> principal resolution -> authorization", async () => {
    // Login through the persisted-identity bridge into the frozen engine.
    const login = await world.auth.authenticate({
      type: "email",
      value: "grace@ada.institute",
      password: PASSWORD,
    });
    expect(login.identity.id).toBe(world.accountId);
    expect(login.accessToken).toBeTypeOf("string");

    // The principal's roles come from membership; permissions from the role catalogue.
    const principal = await resolve(world);
    expect(principal.roles).toEqual(["teacher"]);
    expect([...principal.permissions].sort()).toEqual(["attendance.write", "student.read"]);

    // Authorization: granted actions allow, everything else default-denies.
    expect(world.authz.evaluate({ principal, action: "student.read" }).allowed).toBe(true);
    expect(() => world.authz.assert({ principal, action: "attendance.write" })).not.toThrow();
    expect(world.authz.evaluate({ principal, action: "finance.write" }).allowed).toBe(false);
  });

  it("reflects a membership suspension immediately in authorization", async () => {
    await world.membershipService.suspend(TENANT, world.teacherMembershipId);
    const principal = await resolve(world);
    expect(principal.roles).toEqual([]);
    expect(principal.permissions).toEqual([]);
    expect(world.authz.evaluate({ principal, action: "student.read" }).allowed).toBe(false);
  });

  it("reflects a role permission change immediately (data-driven authorization)", async () => {
    await world.roles.setPermissions(TENANT, world.teacherRoleId, ["timetable.write"]);
    const principal = await resolve(world);
    expect([...principal.permissions]).toEqual(["timetable.write"]);
    expect(world.authz.evaluate({ principal, action: "student.read" }).allowed).toBe(false);
    expect(world.authz.evaluate({ principal, action: "timetable.write" }).allowed).toBe(true);
  });

  it("resolves relationships with correct directionality", async () => {
    const rel = await world.relationships.getById(TENANT, world.relationshipId);
    expect(counterpart(rel, world.studentId)).toEqual({
      personId: world.guardianId,
      role: "guardian",
    });
    expect(counterpart(rel, world.guardianId)).toEqual({
      personId: world.studentId,
      role: "dependent",
    });
  });

  it("isolates principal resolution by tenant", async () => {
    const otherTenantResolver = tenantPrincipalResolver(
      world.accounts,
      world.memberships,
      OTHER_TENANT,
    );
    expect(await otherTenantResolver.resolve(world.accountId)).toBeNull();
  });
});
