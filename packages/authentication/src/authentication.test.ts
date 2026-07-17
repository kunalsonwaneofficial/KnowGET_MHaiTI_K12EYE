import {
  activateIdentity,
  createIdentity,
  InMemoryIdentityRepository,
  setCredential,
} from "@knowget/identity";
import {
  defaultSecurityConfig,
  generateKey,
  SecurityAuditLogger,
  type SecurityConfig,
} from "@knowget/security";
import { verifyJwt } from "@knowget/tokens";
import { describe, expect, it } from "vitest";
import { AuthenticationEngine, AuthenticationError } from "./authentication-engine";
import { InMemorySessionRepository, SessionManager } from "./session";

const KEY = generateKey();

async function setup(config: SecurityConfig = defaultSecurityConfig) {
  const identities = new InMemoryIdentityRepository();
  const identity = activateIdentity(
    createIdentity({
      identifiers: [{ type: "email", value: "user@school.edu" }],
      credentialHash: setCredential("CorrectHorse1!"),
    }),
  );
  await identities.save(identity);
  const sessions = new SessionManager(new InMemorySessionRepository(), config.session);
  const audit = new SecurityAuditLogger();
  const engine = new AuthenticationEngine({ identities, sessions, audit, config, signingKey: KEY });
  return { identities, audit, engine, identityId: identity.id };
}

describe("AuthenticationEngine", () => {
  it("authenticates valid credentials and issues verifiable tokens", async () => {
    const { engine, audit } = await setup();
    const result = await engine.authenticate({
      type: "email",
      value: "user@school.edu",
      password: "CorrectHorse1!",
    });
    expect(result.session.id).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    const claims = verifyJwt(result.accessToken, {
      key: KEY,
      issuer: defaultSecurityConfig.token.issuer,
    });
    expect(claims.sub).toBe(result.identity.id);
    expect(audit.verifyChain()).toBe(true);
    expect(audit.all().some((e) => e.type === "authentication.succeeded")).toBe(true);
  });

  it("rejects a wrong password and locks the account after the configured attempts", async () => {
    const config: SecurityConfig = {
      ...defaultSecurityConfig,
      login: { maxFailedAttempts: 3, lockoutDurationMs: 60_000 },
    };
    const { engine, identities, identityId } = await setup(config);
    for (let i = 0; i < 3; i += 1) {
      await expect(
        engine.authenticate({ type: "email", value: "user@school.edu", password: "wrong" }),
      ).rejects.toThrow(AuthenticationError);
    }
    expect((await identities.findById(identityId))?.status).toBe("locked");
    await expect(
      engine.authenticate({ type: "email", value: "user@school.edu", password: "CorrectHorse1!" }),
    ).rejects.toThrow("locked");
  });

  it("rejects unknown identifiers", async () => {
    const { engine } = await setup();
    await expect(
      engine.authenticate({ type: "email", value: "nobody@x.com", password: "x" }),
    ).rejects.toThrow(AuthenticationError);
  });
});

describe("SessionManager", () => {
  it("validates, expires on idle timeout, and revokes", async () => {
    let now = 1000;
    const manager = new SessionManager(
      new InMemorySessionRepository(),
      { idleTimeoutMs: 100, absoluteTimeoutMs: 10_000, maxConcurrentSessions: 2 },
      () => now,
    );
    const session = await manager.create("id1");
    expect((await manager.validate(session.id))?.id).toBe(session.id);
    now += 200;
    expect(await manager.validate(session.id)).toBeNull();

    now = 2000;
    const another = await manager.create("id1");
    await manager.revoke(another.id);
    expect(await manager.validate(another.id)).toBeNull();
  });

  it("enforces the maximum concurrent sessions", async () => {
    let now = 1000;
    const manager = new SessionManager(
      new InMemorySessionRepository(),
      { idleTimeoutMs: 100_000, absoluteTimeoutMs: 100_000, maxConcurrentSessions: 2 },
      () => now,
    );
    await manager.create("id1");
    now += 1;
    await manager.create("id1");
    now += 1;
    await manager.create("id1");
    expect(await manager.activeCount("id1")).toBe(2);
  });
});
