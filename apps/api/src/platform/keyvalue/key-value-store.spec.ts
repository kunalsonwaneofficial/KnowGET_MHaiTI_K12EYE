import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryKeyValueStore } from "./key-value-store";

let clock: number;
let store: InMemoryKeyValueStore;

beforeEach(() => {
  clock = 1000;
  store = new InMemoryKeyValueStore(() => clock);
});

describe("InMemoryKeyValueStore", () => {
  it("sets and gets a value", async () => {
    await store.set("k", "v");
    expect(await store.get("k")).toBe("v");
    expect(await store.get("missing")).toBeNull();
  });

  it("expires a value after its TTL", async () => {
    await store.set("k", "v", 100);
    expect(await store.get("k")).toBe("v");
    clock += 101;
    expect(await store.get("k")).toBeNull();
  });

  it("deletes a value", async () => {
    await store.set("k", "v");
    await store.delete("k");
    expect(await store.get("k")).toBeNull();
  });

  it("increments a fixed window and resets after it elapses", async () => {
    expect(await store.incrementWindow("w", 1000)).toEqual({ count: 1, resetAt: 2000 });
    const second = await store.incrementWindow("w", 1000);
    expect(second.count).toBe(2);
    expect(second.resetAt).toBe(2000); // still the same window

    clock += 1001;
    expect((await store.incrementWindow("w", 1000)).count).toBe(1); // window reset
  });
});
