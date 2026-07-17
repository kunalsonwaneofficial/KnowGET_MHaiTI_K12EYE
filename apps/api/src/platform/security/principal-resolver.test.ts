import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { InMemoryPrincipalResolver } from "./principal-resolver";

const ID = "11111111-1111-1111-1111-111111111111" as Uuid;
const TENANT = "22222222-2222-2222-2222-222222222222" as TenantId;

describe("InMemoryPrincipalResolver", () => {
  it("resolves a seeded assignment into a principal", async () => {
    const resolver = new InMemoryPrincipalResolver([
      { identityId: ID, tenantId: TENANT, roles: ["administrator"], permissions: ["p"] },
    ]);
    const principal = await resolver.resolve(ID);
    expect(principal).toEqual({
      id: ID,
      tenantId: TENANT,
      roles: ["administrator"],
      permissions: ["p"],
    });
  });

  it("defaults permissions to an empty list", async () => {
    const resolver = new InMemoryPrincipalResolver([{ identityId: ID, roles: ["viewer"] }]);
    const principal = await resolver.resolve(ID);
    expect(principal?.permissions).toEqual([]);
    expect(principal?.tenantId).toBeUndefined();
  });

  it("returns null for an unknown identity", async () => {
    const resolver = new InMemoryPrincipalResolver();
    expect(await resolver.resolve(ID)).toBeNull();
  });

  it("accepts assignments added after construction", async () => {
    const resolver = new InMemoryPrincipalResolver();
    resolver.assign({ identityId: ID, roles: ["viewer"] });
    expect((await resolver.resolve(ID))?.roles).toEqual(["viewer"]);
  });
});
