import { beforeEach, describe, expect, it } from "vitest";
import { KeyValueRateLimiter, SlidingWindowRateLimiter } from "./async-rate-limiter";
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

describe("SlidingWindowRateLimiter", () => {
  let now: number;
  let sliding: SlidingWindowRateLimiter;

  beforeEach(() => {
    now = 1000; // start of a window bucket (1000 / windowMs is integral)
    sliding = new SlidingWindowRateLimiter(new InMemoryKeyValueStore(() => now));
  });

  it("allows up to max within a window, then denies", async () => {
    const opts = { windowMs: 1000, max: 3 };
    expect((await sliding.check("ip", opts)).allowed).toBe(true); // 1
    expect((await sliding.check("ip", opts)).allowed).toBe(true); // 2
    expect((await sliding.check("ip", opts)).allowed).toBe(true); // 3
    expect((await sliding.check("ip", opts)).allowed).toBe(false); // 4 > 3
  });

  it("blocks the boundary burst a fixed window would allow", async () => {
    const opts = { windowMs: 1000, max: 3 };
    for (let i = 0; i < 3; i += 1) {
      expect((await sliding.check("ip", opts)).allowed).toBe(true);
    }
    // Cross into the next window at its very start: the (full) previous window is
    // weighted ~1.0, so estimate ≈ 3 + 1 = 4 > 3 — a fixed window would reset to 0.
    now = 2000;
    expect((await sliding.check("ip", opts)).allowed).toBe(false);
  });

  it("lets the previous window decay as it slides out", async () => {
    const opts = { windowMs: 1000, max: 3 };
    for (let i = 0; i < 3; i += 1) {
      await sliding.check("ip", opts);
    }
    // Late in the next window (90% elapsed → previous weighted 0.1): estimate
    // ≈ 3 * 0.1 + 1 = 1.3 ≤ 3, so requests flow again.
    now = 2900;
    expect((await sliding.check("ip", opts)).allowed).toBe(true);
  });
});
