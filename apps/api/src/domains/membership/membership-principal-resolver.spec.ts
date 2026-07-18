import {
  activateAccount,
  InMemoryIdentityAccountRepository,
  provisionIdentityAccount,
} from "@knowget/enterprise-identity";
import {
  createMembership,
  InMemoryMembershipRepository,
  suspendMembership,
} from "@knowget/membership";
import type { TenantId, Uuid } from "@knowget/types";
import { beforeEach, describe, expect, it } from "vitest";
import { tenantPrincipalResolver } from "./membership-principal-resolver";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const OTHER_TENANT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as TenantId;
const ADA = "22222222-2222-2222-2222-222222222222" as Uuid;
const SCHOOL = "33333333-3333-3333-3333-333333333333" as Uuid;
const SECTION = "44444444-4444-4444-4444-444444444444" as Uuid;

let accounts: InMemoryIdentityAccountRepository;
let memberships: InMemoryMembershipRepository;
let accountId: Uuid;

beforeEach(async () => {
  accounts = new InMemoryIdentityAccountRepository();
  memberships = new InMemoryMembershipRepository();
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

describe("membership principal resolver", () => {
  it("resolves a principal from the account's person's active memberships", async () => {
    await memberships.save(
      createMembership({
        tenantId: TENANT,
        personId: ADA,
        organizationId: SECTION,
        roles: ["coordinator"],
      }),
    );
    const principal = await tenantPrincipalResolver(accounts, memberships, TENANT).resolve(
      accountId,
    );
    expect(principal).not.toBeNull();
    expect(principal?.id).toBe(accountId);
    expect(principal?.tenantId).toBe(TENANT);
    expect([...(principal?.roles ?? [])].sort()).toEqual(["coordinator", "teacher"]);
    // Permissions are expanded from roles by the authorization engine, not here.
    expect(principal?.permissions).toEqual([]);
  });

  it("excludes roles from suspended memberships", async () => {
    const section = createMembership({
      tenantId: TENANT,
      personId: ADA,
      organizationId: SECTION,
      roles: ["coordinator"],
    });
    await memberships.save(suspendMembership(section));
    const principal = await tenantPrincipalResolver(accounts, memberships, TENANT).resolve(
      accountId,
    );
    expect([...(principal?.roles ?? [])]).toEqual(["teacher"]);
  });

  it("returns null for an unknown account and does not cross tenants", async () => {
    const resolver = tenantPrincipalResolver(accounts, memberships, TENANT);
    expect(await resolver.resolve("99999999-9999-9999-9999-999999999999")).toBeNull();
    // The account exists only in TENANT; a resolver bound to another tenant sees nothing.
    expect(
      await tenantPrincipalResolver(accounts, memberships, OTHER_TENANT).resolve(accountId),
    ).toBeNull();
  });
});
