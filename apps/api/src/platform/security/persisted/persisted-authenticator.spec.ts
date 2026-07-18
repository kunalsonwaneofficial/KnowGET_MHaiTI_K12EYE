import { AuthenticationError } from "@knowget/authentication";
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
import { InMemoryRefreshTokenStore } from "./refresh-token-store";
import { InMemoryRevocationStore } from "./revocation-store";
import { InMemorySessionStore } from "./session-store";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const PERSON = "22222222-2222-2222-2222-222222222222" as Uuid;
const EMAIL = "admin@school.edu";
const PASSWORD = "correct horse battery staple";
const SIGNING_KEY = Buffer.from("persisted-auth-signing-secret-32bytes!");

let accounts: InMemoryIdentityAccountRepository;
let sessions: InMemorySessionStore;
let refreshTokens: InMemoryRefreshTokenStore;
let revocations: InMemoryRevocationStore;
let authenticator: PersistedAuthenticator;
let accountId: Uuid;

beforeEach(async () => {
  accounts = new InMemoryIdentityAccountRepository();
  sessions = new InMemorySessionStore();
  refreshTokens = new InMemoryRefreshTokenStore();
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
    refreshTokens,
    revocations,
    new SecurityAuditLogger(),
    defaultSecurityConfig,
    SIGNING_KEY,
  );
});

const claimsOf = (token: string): JwtClaims =>
  verifyJwt(token, { key: SIGNING_KEY, issuer: defaultSecurityConfig.token.issuer });

describe("PersistedAuthenticator", () => {
  it("issues a token carrying tenant/sid/jti/fid and persists the session in-tenant", async () => {
    const result = await authenticator.login({ tenant: TENANT, email: EMAIL, password: PASSWORD });
    expect(result.refreshToken).toBeTypeOf("string");

    const claims = claimsOf(result.accessToken);
    expect(claims.sub).toBe(accountId);
    expect(claims.tenant).toBe(TENANT);
    expect(claims.sid).toBeTypeOf("string");
    expect(claims.jti).toBeTypeOf("string");
    expect(claims.fid).toBeTypeOf("string");

    const session = await sessions.findById(TENANT, claims.sid as string);
    expect(session?.identityId).toBe(accountId);
  });

  it("requires a tenant to log in and to refresh", async () => {
    await expect(authenticator.login({ email: EMAIL, password: PASSWORD })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(authenticator.refresh({ refreshToken: "x" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("rotates a refresh token: new pair, same session, same family", async () => {
    const login = await authenticator.login({ tenant: TENANT, email: EMAIL, password: PASSWORD });
    const loginClaims = claimsOf(login.accessToken);

    const refreshed = await authenticator.refresh({
      tenant: TENANT,
      refreshToken: login.refreshToken,
    });
    const refreshedClaims = claimsOf(refreshed.accessToken);

    expect(refreshed.refreshToken).not.toBe(login.refreshToken); // rotated
    expect(refreshedClaims.sid).toBe(loginClaims.sid); // session-bound (same session)
    expect(refreshedClaims.fid).toBe(loginClaims.fid); // same family
    expect(refreshedClaims.jti).not.toBe(loginClaims.jti); // fresh access token
  });

  it("rejects an unknown refresh token", async () => {
    await expect(
      authenticator.refresh({ tenant: TENANT, refreshToken: "not-a-real-token" }),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("detects replay: reusing a consumed token revokes the whole family", async () => {
    const login = await authenticator.login({ tenant: TENANT, email: EMAIL, password: PASSWORD });
    const familyId = claimsOf(login.accessToken).fid as string;

    // First refresh consumes the login token and issues a successor.
    const refreshed = await authenticator.refresh({
      tenant: TENANT,
      refreshToken: login.refreshToken,
    });

    // Replaying the now-consumed login token is theft → reject + revoke family.
    await expect(
      authenticator.refresh({ tenant: TENANT, refreshToken: login.refreshToken }),
    ).rejects.toBeInstanceOf(AuthenticationError);
    expect(await revocations.isRevoked(TENANT, { familyId })).toBe(true);

    // The successor token is now useless too — its family is revoked.
    await expect(
      authenticator.refresh({ tenant: TENANT, refreshToken: refreshed.refreshToken }),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("logout revokes the session, the token, and the refresh family", async () => {
    const login = await authenticator.login({ tenant: TENANT, email: EMAIL, password: PASSWORD });
    const claims = claimsOf(login.accessToken);
    const sid = claims.sid as string;
    const jti = claims.jti as string;
    const fid = claims.fid as string;

    await authenticator.logout({ sessionId: sid, tokenId: jti, familyId: fid, tenant: TENANT });

    expect((await sessions.findById(TENANT, sid))?.revoked).toBe(true);
    expect(await revocations.isRevoked(TENANT, { tokenId: jti })).toBe(true);
    expect(await revocations.isRevoked(TENANT, { familyId: fid })).toBe(true);
    // A logged-out family can no longer refresh.
    await expect(
      authenticator.refresh({ tenant: TENANT, refreshToken: login.refreshToken }),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });
});
