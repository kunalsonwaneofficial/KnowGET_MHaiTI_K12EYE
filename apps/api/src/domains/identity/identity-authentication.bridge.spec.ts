import {
  AuthenticationEngine,
  AuthenticationError,
  InMemorySessionRepository,
  SessionManager,
} from "@knowget/authentication";
import {
  IdentityAccountService,
  InMemoryIdentityAccountRepository,
  type PersonDirectory,
} from "@knowget/enterprise-identity";
import { defaultSecurityConfig, hashPassword, SecurityAuditLogger } from "@knowget/security";
import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { tenantIdentityRepository } from "./identity-authentication.bridge";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const OTHER_TENANT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as TenantId;
const ADA = "22222222-2222-2222-2222-222222222222" as Uuid;
const PASSWORD = "correct horse battery staple";
const SIGNING_KEY = Buffer.from("test-signing-secret-please-use-32bytes");
const anyPerson: PersonDirectory = { exists: async () => true };

function engineFor(accounts: InMemoryIdentityAccountRepository, tenantId: TenantId) {
  return new AuthenticationEngine({
    identities: tenantIdentityRepository(accounts, tenantId),
    sessions: new SessionManager(new InMemorySessionRepository(), defaultSecurityConfig.session),
    audit: new SecurityAuditLogger(),
    config: defaultSecurityConfig,
    signingKey: SIGNING_KEY,
  });
}

async function setup() {
  const accounts = new InMemoryIdentityAccountRepository();
  const service = new IdentityAccountService({
    repository: accounts,
    persons: anyPerson,
    hasher: { hash: (plaintext) => hashPassword(plaintext) },
  });
  const account = await service.provision({
    tenantId: TENANT,
    personId: ADA,
    identifiers: [{ type: "email", value: "ada@school.edu" }],
    password: PASSWORD,
    activate: true,
  });
  return { accounts, account };
}

describe("identity <-> authentication bridge", () => {
  it("authenticates a provisioned, persisted account through the frozen engine", async () => {
    const { accounts, account } = await setup();
    const result = await engineFor(accounts, TENANT).authenticate({
      type: "email",
      value: "ada@school.edu",
      password: PASSWORD,
    });
    expect(result.identity.id).toBe(account.id);
    expect(result.accessToken).toBeTypeOf("string");
    expect(result.refreshToken).toBeTypeOf("string");
    expect(result.session.identityId).toBe(account.id);
  });

  it("writes failed-attempt counters back onto the persisted account", async () => {
    const { accounts, account } = await setup();
    await expect(
      engineFor(accounts, TENANT).authenticate({
        type: "email",
        value: "ada@school.edu",
        password: "wrong",
      }),
    ).rejects.toBeInstanceOf(AuthenticationError);
    const reloaded = await accounts.findById(TENANT, account.id);
    expect(reloaded?.failedLoginAttempts).toBe(1);
  });

  it("does not resolve identifiers across tenants (tenant-qualified login)", async () => {
    const { accounts } = await setup();
    await expect(
      engineFor(accounts, OTHER_TENANT).authenticate({
        type: "email",
        value: "ada@school.edu",
        password: PASSWORD,
      }),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });
});
