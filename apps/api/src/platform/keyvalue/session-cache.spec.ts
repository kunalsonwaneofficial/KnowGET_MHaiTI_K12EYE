import { beforeEach, describe, expect, it } from "vitest";
import { KeyValueCache } from "./key-value-cache";
import { InMemoryKeyValueStore } from "./key-value-store";
import { SessionValidityCache } from "./session-cache";

const TENANT = "11111111-1111-1111-1111-111111111111";
let clock: number;
let sc: SessionValidityCache;

beforeEach(() => {
  clock = 1000;
  sc = new SessionValidityCache(new KeyValueCache(new InMemoryKeyValueStore(() => clock)), 5000);
});

describe("SessionValidityCache", () => {
  it("marks and reads a session as valid", async () => {
    expect(await sc.isValid(TENANT, "s")).toBe(false);
    await sc.markValid(TENANT, "s");
    expect(await sc.isValid(TENANT, "s")).toBe(true);
  });

  it("invalidates immediately (prompt revoke)", async () => {
    await sc.markValid(TENANT, "s");
    await sc.invalidate(TENANT, "s");
    expect(await sc.isValid(TENANT, "s")).toBe(false);
  });

  it("expires after the TTL (staleness bound)", async () => {
    await sc.markValid(TENANT, "s");
    clock += 5001;
    expect(await sc.isValid(TENANT, "s")).toBe(false);
  });

  it("isolates sessions by tenant", async () => {
    await sc.markValid(TENANT, "s");
    expect(await sc.isValid("22222222-2222-2222-2222-222222222222", "s")).toBe(false);
  });
});
