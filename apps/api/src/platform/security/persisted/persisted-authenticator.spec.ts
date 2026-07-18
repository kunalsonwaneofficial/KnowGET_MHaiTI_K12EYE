import {
  activateAccount,
  InMemoryIdentityAccountRepository,
  provisionIdentityAccount,
} from "@knowget/enterprise-identity";
import { ValidationError } from "@knowget/exceptions";
import { defaultSecurityConfig, hashPassword, SecurityAuditLogger } from "@knowget/security";
import { type JwtClaims, verifyJwt } from "@knowget/tokens";
import type { TenantId, Uuid } from "@knowget/types";
import { beforeEach, describe, expect, it } from "vitest";
import { PersistedAuthenticator } from "./persisted-authenticator";
import { InMemoryRevocationStore } from "./revocation-store";
import { InMemorySessionStore } from "./session-store";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const PERSON = "22222222-2222-2222-2222-222222222222" as Uuid;
const EMAIL = "admin@school.edu";
const PASSWORD = "correct horse battery staple";
const SIGNING_KEY = Buffer.from("persisted-auth-signing-secret-32bytes!");

let accounts: InMemoryIdentityAccountRepository;
let sessions: InMemorySessionStore;
let revocations: InMemoryRevocationStore;
let authenticator: PersistedAuthenticator;
let accountId: Uuid;

beforeEach(async () => {
  accounts = new InMemoryIdentityAccountRepository();
  sessions = new InMemorySessionStore();
  revocations = new InMemoryRevocationStore();
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
    sessions,
    revocations,
    new SecurityAuditLogger(),
    defaultSecurityConfig,
    SIGNING_KEY,
  );
});

const claimsOf = (token: string): JwtClaims =>
  verifyJwt(token, { key: SIGNING_KEY, issuer: defaultSecurityConfig.token.issuer });

describe("PersistedAuthenticator", () => {
  it("issues a token carrying tenant/sid/jti and persists the session in-tenant", async () => {
    const result = await authenticator.login({ tenant: TENANT, email: EMAIL, password: PASSWORD });
    expect(result.refreshToken).toBeTypeOf("string");

    const claims = claimsOf(result.accessToken);
    expect(claims.sub).toBe(accountId);
    expect(claims.tenant).toBe(TENANT);
    expect(claims.sid).toBeTypeOf("string");
    expect(claims.jti).toBeTypeOf("string");

    // The session was created in the persisted store, scoped to the tenant.
    const session = await sessions.findById(TENANT, claims.sid as string);
    expect(session?.identityId).toBe(accountId);
    expect(session?.revoked).toBe(false);
  });

  it("requires a tenant", async () => {
    await expect(authenticator.login({ email: EMAIL, password: PASSWORD })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("logout revokes the session and records the token as revoked", async () => {
    const result = await authenticator.login({ tenant: TENANT, email: EMAIL, password: PASSWORD });
    const claims = claimsOf(result.accessToken);
    const sid = claims.sid as string;
    const jti = claims.jti as string;

    await authenticator.logout({ sessionId: sid, tokenId: jti, tenant: TENANT });

    expect((await sessions.findById(TENANT, sid))?.revoked).toBe(true);
    expect(await revocations.isRevoked(TENANT, { tokenId: jti })).toBe(true);
  });
});
