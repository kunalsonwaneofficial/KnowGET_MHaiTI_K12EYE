import type { TenantId } from "@knowget/types";
import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryRevocationStore } from "./revocation-store";

const TENANT_A = "11111111-1111-1111-1111-111111111111" as TenantId;
const TENANT_B = "22222222-2222-2222-2222-222222222222" as TenantId;

let store: InMemoryRevocationStore;

beforeEach(() => {
  store = new InMemoryRevocationStore();
});

describe("InMemoryRevocationStore", () => {
  it("reports a revoked token id as revoked", async () => {
    await store.revoke(TENANT_A, "token", "jti-1");
    expect(await store.isRevoked(TENANT_A, { tokenId: "jti-1" })).toBe(true);
    expect(await store.isRevoked(TENANT_A, { tokenId: "jti-other" })).toBe(false);
  });

  it("reports a revoked family as revoked (kind is distinguished)", async () => {
    await store.revoke(TENANT_A, "family", "fam-1");
    expect(await store.isRevoked(TENANT_A, { familyId: "fam-1" })).toBe(true);
    // Same ref string, wrong kind → not revoked.
    expect(await store.isRevoked(TENANT_A, { tokenId: "fam-1" })).toBe(false);
  });

  it("isolates revocations by tenant", async () => {
    await store.revoke(TENANT_A, "token", "jti-1");
    expect(await store.isRevoked(TENANT_B, { tokenId: "jti-1" })).toBe(false);
  });

  it("returns false when there is nothing to check", async () => {
    expect(await store.isRevoked(TENANT_A, {})).toBe(false);
  });
});
