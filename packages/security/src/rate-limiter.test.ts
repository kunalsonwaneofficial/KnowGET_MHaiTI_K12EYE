import { describe, expect, it } from "vitest";
import { RateLimiter } from "./rate-limiter";

describe("RateLimiter", () => {
  it("allows up to the limit, then blocks within the window", () => {
    const now = 0;
    const limiter = new RateLimiter({ windowMs: 1000, max: 2 }, () => now);
    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(false);
  });

  it("resets after the window elapses", () => {
    let now = 0;
    const limiter = new RateLimiter({ windowMs: 1000, max: 1 }, () => now);
    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(false);
    now += 1001;
    expect(limiter.check("ip").allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    const limiter = new RateLimiter({ windowMs: 1000, max: 1 }, () => 0);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("b").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
  });
});
