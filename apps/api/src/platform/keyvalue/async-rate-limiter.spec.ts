import { beforeEach, describe, expect, it } from "vitest";
import { KeyValueRateLimiter } from "./async-rate-limiter";
import { InMemoryKeyValueStore } from "./key-value-store";

let clock: number;
let limiter: KeyValueRateLimiter;

beforeEach(() => {
  clock = 1000;
  limiter = new KeyValueRateLimiter(new InMemoryKeyValueStore(() => clock));
});

describe("KeyValueRateLimiter", () => {
  it("allows up to max, then denies within a window", async () => {
    const opts = { windowMs: 1000, max: 2 };
    const a = await limiter.check("ip", opts);
    expect(a.allowed).toBe(true);
    expect(a.remaining).toBe(1);
    const b = await limiter.check("ip", opts);
    expect(b.allowed).toBe(true);
    expect(b.remaining).toBe(0);
    const c = await limiter.check("ip", opts);
    expect(c.allowed).toBe(false);
    expect(c.remaining).toBe(0);
  });

  it("resets after the window elapses", async () => {
    const opts = { windowMs: 1000, max: 1 };
    expect((await limiter.check("ip", opts)).allowed).toBe(true);
    expect((await limiter.check("ip", opts)).allowed).toBe(false);
    clock += 1001;
    expect((await limiter.check("ip", opts)).allowed).toBe(true);
  });

  it("counts each client key independently", async () => {
    const opts = { windowMs: 1000, max: 1 };
    expect((await limiter.check("a", opts)).allowed).toBe(true);
    expect((await limiter.check("b", opts)).allowed).toBe(true);
  });
});
