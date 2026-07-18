import {
  activateAccount,
  InMemoryIdentityAccountRepository,
  provisionIdentityAccount,
} from "@knowget/enterprise-identity";
import { createMembership, InMemoryMembershipRepository } from "@knowget/membership";
import type { TenantId, Uuid } from "@knowget/types";
import { beforeEach, describe, expect, it } from "vitest";
import { PersistedPrincipalResolver } from "./persisted-principal-resolver";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const OTHER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as TenantId;
const PERSON = "22222222-2222-2222-2222-222222222222" as Uuid;
const ORG = "33333333-3333-3333-3333-333333333333" as Uuid;

let resolver: PersistedPrincipalResolver;
let accountId: Uuid;

beforeEach(async () => {
  const accounts = new InMemoryIdentityAccountRepository();
  const memberships = new InMemoryMembershipRepository();
  const account = activateAccount(
    provisionIdentityAccount({
      tenantId: TENANT,
      personId: PERSON,
      identifiers: [{ type: "email", value: "a@b.com" }],
    }),
  );
  await accounts.save(account);
  accountId = account.id;
  await memberships.save(
    createMembership({
      tenantId: TENANT,
      personId: PERSON,
      organizationId: ORG,
      roles: ["teacher"],
    }),
  );
  resolver = new PersistedPrincipalResolver(accounts, memberships, async (_tenantId, names) =>
    names.includes("teacher") ? ["student.read"] : [],
  );
});

describe("PersistedPrincipalResolver", () => {
  it("resolves roles and expanded permissions for the account's tenant", async () => {
    const principal = await resolver.resolve(accountId, TENANT);
    expect(principal?.id).toBe(accountId);
    expect(principal?.tenantId).toBe(TENANT);
    expect(principal?.roles).toEqual(["teacher"]);
    expect(principal?.permissions).toEqual(["student.read"]);
  });

  it("resolves nothing without a tenant, or for a different tenant", async () => {
    expect(await resolver.resolve(accountId)).toBeNull();
    expect(await resolver.resolve(accountId, OTHER)).toBeNull();
  });
});
