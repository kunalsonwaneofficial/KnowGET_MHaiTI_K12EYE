import type { TenantId } from "@knowget/types";
import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryRefreshTokenStore, type NewRefreshToken } from "./refresh-token-store";

const TENANT_A = "11111111-1111-1111-1111-111111111111" as TenantId;
const TENANT_B = "22222222-2222-2222-2222-222222222222" as TenantId;

const sample = (overrides: Partial<NewRefreshToken> = {}): NewRefreshToken => ({
  familyId: "fam-1",
  identityId: "id-1",
  sessionId: "sess-1",
  tokenHash: "hash-1",
  issuedAt: 1000,
  expiresAt: 9_999_999,
  ...overrides,
});

let store: InMemoryRefreshTokenStore;

beforeEach(() => {
  store = new InMemoryRefreshTokenStore();
});

describe("InMemoryRefreshTokenStore", () => {
  it("saves an active token and resolves it by hash", async () => {
    const saved = await store.save(TENANT_A, sample());
    expect(saved.id).toBeTruthy();
    expect(saved.status).toBe("active");

    const found = await store.findByHash(TENANT_A, "hash-1");
    expect(found?.id).toBe(saved.id);
    expect(found?.familyId).toBe("fam-1");
  });

  it("isolates tokens by tenant", async () => {
    await store.save(TENANT_A, sample());
    expect(await store.findByHash(TENANT_B, "hash-1")).toBeNull();
  });

  it("markRotated consumes the token (making a later reuse detectable)", async () => {
    const saved = await store.save(TENANT_A, sample());
    await store.markRotated(TENANT_A, saved.id);

    const found = await store.findByHash(TENANT_A, "hash-1");
    expect(found?.status).toBe("rotated");
  });

  it("returns null for an unknown hash", async () => {
    expect(await store.findByHash(TENANT_A, "nope")).toBeNull();
  });
});
