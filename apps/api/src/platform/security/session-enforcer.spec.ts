import { SessionManager } from "@knowget/authentication";
import { defaultSecurityConfig } from "@knowget/security";
import type { TenantId } from "@knowget/types";
import { beforeEach, describe, expect, it } from "vitest";
import { KeyValueCache } from "../keyvalue/key-value-cache";
import { InMemoryKeyValueStore } from "../keyvalue/key-value-store";
import { SessionValidityCache } from "../keyvalue/session-cache";
import { InMemoryRevocationStore } from "./persisted/revocation-store";
import { InMemorySessionStore } from "./persisted/session-store";
import { tenantSessionRepository } from "./persisted/tenant-session.repository";
import { PersistedSessionEnforcer } from "./session-enforcer";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const OTHER_TENANT = "22222222-2222-2222-2222-222222222222" as TenantId;

let sessions: InMemorySessionStore;
let revocations: InMemoryRevocationStore;
let enforcer: PersistedSessionEnforcer;

beforeEach(() => {
  sessions = new InMemorySessionStore();
  revocations = new InMemoryRevocationStore();
  enforcer = new PersistedSessionEnforcer(sessions, revocations, defaultSecurityConfig);
});

/** Create a live session in the store (via the frozen manager) and return its id. */
async function createSession(tenantId: TenantId, identityId = "identity-1"): Promise<string> {
  const manager = new SessionManager(
    tenantSessionRepository(sessions, tenantId),
    defaultSecurityConfig.session,
  );
  return (await manager.create(identityId)).id;
}

describe("PersistedSessionEnforcer", () => {
  it("allows a valid session", async () => {
    const sid = await createSession(TENANT);
    expect(await enforcer.enforce({ sessionId: sid, tokenId: "jti-1", tenantId: TENANT })).toBe(
      true,
    );
  });

  it("fails closed when the tenant or session id is missing", async () => {
    const sid = await createSession(TENANT);
    expect(await enforcer.enforce({ sessionId: sid })).toBe(false);
    expect(await enforcer.enforce({ tenantId: TENANT })).toBe(false);
  });

  it("rejects a session that belongs to another tenant", async () => {
    const sid = await createSession(TENANT);
    expect(await enforcer.enforce({ sessionId: sid, tenantId: OTHER_TENANT })).toBe(false);
  });

  it("rejects a revoked session", async () => {
    const sid = await createSession(TENANT);
    const manager = new SessionManager(
      tenantSessionRepository(sessions, TENANT),
      defaultSecurityConfig.session,
    );
    await manager.revoke(sid);
    expect(await enforcer.enforce({ sessionId: sid, tenantId: TENANT })).toBe(false);
  });

  it("rejects a revoked token id even when the session is valid", async () => {
    const sid = await createSession(TENANT);
    await revocations.revoke(TENANT, "token", "jti-bad");
    expect(await enforcer.enforce({ sessionId: sid, tokenId: "jti-bad", tenantId: TENANT })).toBe(
      false,
    );
    // A different token on the same valid session still passes.
    expect(await enforcer.enforce({ sessionId: sid, tokenId: "jti-ok", tenantId: TENANT })).toBe(
      true,
    );
  });

  it("read-through cache skips the store validate until invalidated (TD-22)", async () => {
    const cache = new SessionValidityCache(new KeyValueCache(new InMemoryKeyValueStore()), 60_000);
    const cached = new PersistedSessionEnforcer(
      sessions,
      revocations,
      defaultSecurityConfig,
      cache,
    );
    const sid = await createSession(TENANT);

    // First call validates against the store and caches the result.
    expect(await cached.enforce({ sessionId: sid, tenantId: TENANT })).toBe(true);

    // Revoke directly in the store — the cached fast path still admits it...
    const manager = new SessionManager(
      tenantSessionRepository(sessions, TENANT),
      defaultSecurityConfig.session,
    );
    await manager.revoke(sid);
    expect(await cached.enforce({ sessionId: sid, tenantId: TENANT })).toBe(true);

    // ...until the cache entry is invalidated, after which the store is re-checked.
    await cache.invalidate(TENANT, sid);
    expect(await cached.enforce({ sessionId: sid, tenantId: TENANT })).toBe(false);
  });
});
