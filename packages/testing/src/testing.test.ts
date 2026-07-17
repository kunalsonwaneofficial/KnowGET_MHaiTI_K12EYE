import { describe, expect, it } from "vitest";
import { flushPromises } from "./flush-promises";
import { createManualClock } from "./manual-clock";

describe("createManualClock", () => {
  it("starts at the given instant and advances deterministically", () => {
    const clock = createManualClock();
    expect(clock.now()).toBe("2026-01-01T00:00:00.000Z");
    clock.advance(1000);
    expect(clock.now()).toBe("2026-01-01T00:00:01.000Z");
  });
});

describe("flushPromises", () => {
  it("resolves after pending async work", async () => {
    let done = false;
    void Promise.resolve().then(() => {
      done = true;
    });
    await flushPromises();
    expect(done).toBe(true);
  });
});
