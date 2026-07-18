import {
  activateAccount,
  InMemoryIdentityAccountRepository,
  provisionIdentityAccount,
} from "@knowget/enterprise-identity";
import { createMembership, InMemoryMembershipRepository } from "@knowget/membership";
import { InMemoryRoleRepository, RoleService } from "@knowget/roles";
import type { TenantId, Uuid } from "@knowget/types";
import { beforeEach, describe, expect, it } from "vitest";
import { tenantPrincipalResolver } from "../membership/membership-principal-resolver";
import { withResolvedPermissions } from "./principal-permissions";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ADA = "22222222-2222-2222-2222-222222222222" as Uuid;
const SCHOOL = "33333333-3333-3333-3333-333333333333" as Uuid;

let accounts: InMemoryIdentityAccountRepository;
let memberships: InMemoryMembershipRepository;
let roles: RoleService;
let accountId: Uuid;

async function resolvePrincipal() {
  const base = tenantPrincipalResolver(accounts, memberships, TENANT);
  const resolver = withResolvedPermissions(base, (tenantId, names) =>
    roles.permissionsForRoleNames(tenantId, names),
  );
  return resolver.resolve(accountId);
}

beforeEach(async () => {
  accounts = new InMemoryIdentityAccountRepository();
  memberships = new InMemoryMembershipRepository();
  roles = new RoleService({ repository: new InMemoryRoleRepository() });

  const account = activateAccount(
    provisionIdentityAccount({
      tenantId: TENANT,
      personId: ADA,
      identifiers: [{ type: "email", value: "ada@school.edu" }],
    }),
  );
  await accounts.save(account);
  accountId = account.id;
  await memberships.save(
    createMembership({
      tenantId: TENANT,
      personId: ADA,
      organizationId: SCHOOL,
      roles: ["teacher"],
    }),
  );
});

describe("principal permission resolution (closing the authorization loop)", () => {
  it("expands a principal's role names into the tenant role's permissions", async () => {
    await roles.define({
      tenantId: TENANT,
      name: "teacher",
      permissions: ["student.read", "attendance.write"],
    });
    const principal = await resolvePrincipal();
    expect(principal?.roles).toEqual(["teacher"]);
    expect([...(principal?.permissions ?? [])].sort()).toEqual([
      "attendance.write",
      "student.read",
    ]);
  });

  it("grants no permissions when the role is undefined or archived (fail-safe)", async () => {
    // No "teacher" role defined yet → no permissions.
    expect((await resolvePrincipal())?.permissions).toEqual([]);

    const teacher = await roles.define({
      tenantId: TENANT,
      name: "teacher",
      permissions: ["student.read"],
    });
    expect((await resolvePrincipal())?.permissions).toEqual(["student.read"]);

    await roles.archive(TENANT, teacher.id);
    expect((await resolvePrincipal())?.permissions).toEqual([]);
  });
});
