import { InMemorySessionRepository, SessionManager } from "@knowget/authentication";
import {
  activateAccount,
  InMemoryIdentityAccountRepository,
  provisionIdentityAccount,
} from "@knowget/enterprise-identity";
import { ValidationError } from "@knowget/exceptions";
import { defaultSecurityConfig, hashPassword, SecurityAuditLogger } from "@knowget/security";
import { verifyJwt } from "@knowget/tokens";
import type { TenantId, Uuid } from "@knowget/types";
import { beforeEach, describe, expect, it } from "vitest";
import { PersistedAuthenticator } from "./persisted-authenticator";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const PERSON = "22222222-2222-2222-2222-222222222222" as Uuid;
const EMAIL = "admin@school.edu";
const PASSWORD = "correct horse battery staple";
const SIGNING_KEY = Buffer.from("persisted-auth-signing-secret-32bytes!");

let accounts: InMemoryIdentityAccountRepository;
let authenticator: PersistedAuthenticator;
let accountId: Uuid;

beforeEach(async () => {
  accounts = new InMemoryIdentityAccountRepository();
  const account = activateAccount(
    provisionIdentityAccount({
      tenantId: TENANT,
      personId: PERSON,
      identifiers: [{ type: "email", value: EMAIL }],
      credentialHash: hashPassword(PASSWORD),
    }),
  );
  await accounts.save(account);
  accountId = account.id;
  authenticator = new PersistedAuthenticator(
    accounts,
    new SessionManager(new InMemorySessionRepository(), defaultSecurityConfig.session),
    new SecurityAuditLogger(),
    defaultSecurityConfig,
    SIGNING_KEY,
  );
});

describe("PersistedAuthenticator", () => {
  it("issues a token carrying the tenant claim on tenant-qualified login", async () => {
    const result = await authenticator.login({ tenant: TENANT, email: EMAIL, password: PASSWORD });
    expect(result.refreshToken).toBeTypeOf("string");
    const claims = verifyJwt(result.accessToken, {
      key: SIGNING_KEY,
      issuer: defaultSecurityConfig.token.issuer,
    });
    expect(claims.sub).toBe(accountId);
    expect(claims.tenant).toBe(TENANT);
  });

  it("requires a tenant", async () => {
    await expect(authenticator.login({ email: EMAIL, password: PASSWORD })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
