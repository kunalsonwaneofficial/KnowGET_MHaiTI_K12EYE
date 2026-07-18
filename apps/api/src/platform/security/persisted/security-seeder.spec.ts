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
import { hashPassword } from "@knowget/security";
import type { TenantId, Uuid } from "@knowget/types";
import { beforeEach, describe, expect, it } from "vitest";
import { SecuritySeeder } from "./security-seeder";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ADMIN = { tenantId: TENANT, email: "admin@knowget.local", password: "ChangeMe!Bootstrap1" };

let seeder: SecuritySeeder;
let accounts: InMemoryIdentityAccountRepository;
let roles: RoleService;
let memberships: MembershipService;

beforeEach(() => {
  accounts = new InMemoryIdentityAccountRepository();
  const memberRepo = new InMemoryMembershipRepository();
  const persons = new PersonService(new InMemoryPersonRepository());
  const organizations = new OrganizationService(new InMemoryOrganizationRepository());
  roles = new RoleService({ repository: new InMemoryRoleRepository() });

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
  memberships = new MembershipService({
    repository: memberRepo,
    persons: membershipPersons,
    organizations: organizationsDir,
    roles: rolesDir,
  });

  seeder = new SecuritySeeder({ persons, organizations, roles, identities, memberships, accounts });
});

describe("SecuritySeeder", () => {
  it("seeds a bootstrap administrator with the administrator role", async () => {
    expect(await seeder.seed(ADMIN)).toEqual({ seeded: true });

    const account = await accounts.findByIdentifier(TENANT, "email", ADMIN.email);
    expect(account).not.toBeNull();
    expect(account?.status).toBe("active");

    expect((await roles.getByName(TENANT, "administrator")).permissions).toEqual(["*"]);
    const membershipList = account ? await memberships.listByPerson(TENANT, account.personId) : [];
    expect(membershipList).toHaveLength(1);
    expect(membershipList[0]?.roles).toEqual(["administrator"]);
  });

  it("is idempotent — a second seed is a no-op", async () => {
    await seeder.seed(ADMIN);
    expect(await seeder.seed(ADMIN)).toEqual({ seeded: false });
    // Still exactly one administrator role and one account.
    expect(await roles.list(TENANT)).toHaveLength(1);
    expect(await accounts.listByTenant(TENANT)).toHaveLength(1);
  });
});
