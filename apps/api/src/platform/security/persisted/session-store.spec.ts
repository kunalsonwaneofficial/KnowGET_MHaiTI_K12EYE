import { SessionManager } from "@knowget/authentication";
import { defaultSecurityConfig } from "@knowget/security";
import type { TenantId } from "@knowget/types";
import { beforeEach, describe, expect, it } from "vitest";
import { InMemorySessionStore } from "./session-store";
import { tenantSessionRepository } from "./tenant-session.repository";

const TENANT_A = "11111111-1111-1111-1111-111111111111" as TenantId;
const TENANT_B = "22222222-2222-2222-2222-222222222222" as TenantId;
// Decouple from the default concurrency cap so multi-session cases don't evict.
const policy = { ...defaultSecurityConfig.session, maxConcurrentSessions: 10 };

let store: InMemorySessionStore;

beforeEach(() => {
  store = new InMemorySessionStore();
});

describe("InMemorySessionStore + tenantSessionRepository", () => {
  it("creates a session (via the frozen SessionManager) and reads it back in-tenant", async () => {
    const sessions = new SessionManager(tenantSessionRepository(store, TENANT_A), policy);
    const created = await sessions.create("identity-1", { device: "cli" });

    expect(created.id).toBeTruthy();
    const row = await store.findById(TENANT_A, created.id);
    expect(row?.identityId).toBe("identity-1");
    expect(row?.device).toBe("cli");
    expect(row?.revoked).toBe(false);
  });

  it("isolates sessions by tenant", async () => {
    const sessionsA = new SessionManager(tenantSessionRepository(store, TENANT_A), policy);
    const created = await sessionsA.create("identity-1");

    // The same store bound to another tenant cannot see or validate the session.
    expect(await store.findById(TENANT_B, created.id)).toBeNull();
    const sessionsB = new SessionManager(tenantSessionRepository(store, TENANT_B), policy);
    expect(await sessionsB.validate(created.id)).toBeNull();
    // Its own tenant still validates it.
    expect(await sessionsA.validate(created.id)).not.toBeNull();
  });

  it("revocation is persisted and makes validation fail", async () => {
    const sessions = new SessionManager(tenantSessionRepository(store, TENANT_A), policy);
    const created = await sessions.create("identity-1");

    await sessions.revoke(created.id);

    expect(await sessions.validate(created.id)).toBeNull();
    expect((await store.findById(TENANT_A, created.id))?.revoked).toBe(true);
  });

  it("findByIdentity returns only that identity's sessions within the tenant", async () => {
    const sessions = new SessionManager(tenantSessionRepository(store, TENANT_A), policy);
    await sessions.create("identity-1");
    await sessions.create("identity-1");
    await sessions.create("identity-2");

    expect(await store.findByIdentity(TENANT_A, "identity-1")).toHaveLength(2);
    expect(await store.findByIdentity(TENANT_A, "identity-2")).toHaveLength(1);
    expect(await store.findByIdentity(TENANT_B, "identity-1")).toHaveLength(0);
  });
});
