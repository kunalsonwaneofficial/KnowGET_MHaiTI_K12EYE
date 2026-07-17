import { RateLimitError } from "@knowget/exceptions";
import { RateLimiter } from "@knowget/security";
import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import type { AuthenticatedRequest } from "./authenticated-request";
import type { RateLimitMetadata } from "./decorators";
import { RateLimitGuard } from "./rate-limit.guard";

function stubReflector(override: RateLimitMetadata | undefined): Reflector {
  return { getAllAndOverride: () => override } as unknown as Reflector;
}

function makeContext(): { context: ExecutionContext; headers: Map<string, string | number> } {
  const headers = new Map<string, string | number>();
  const request: AuthenticatedRequest = { headers: {}, ip: "203.0.113.7" };
  const response = {
    setHeader: (name: string, value: string | number) => headers.set(name, value),
  };
  const context = {
    getHandler: () => function handler() {},
    getClass: () => class Ctrl {},
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
  return { context, headers };
}

describe("RateLimitGuard", () => {
  it("allows requests under the limit and emits rate-limit headers", () => {
    const guard = new RateLimitGuard(
      stubReflector(undefined),
      new RateLimiter({ windowMs: 1000, max: 2 }, () => 0),
    );
    const { context, headers } = makeContext();
    expect(guard.canActivate(context)).toBe(true);
    expect(headers.get("X-RateLimit-Limit")).toBe(2);
    expect(headers.get("X-RateLimit-Remaining")).toBe(1);
    expect(headers.get("X-RateLimit-Reset")).toBe(1);
  });

  it("blocks requests over the limit with a 429 and Retry-After", () => {
    const guard = new RateLimitGuard(
      stubReflector(undefined),
      new RateLimiter({ windowMs: 1000, max: 1 }, () => 0),
    );
    expect(guard.canActivate(makeContext().context)).toBe(true);
    const { context, headers } = makeContext();
    expect(() => guard.canActivate(context)).toThrow(RateLimitError);
    expect(headers.get("Retry-After")).toBeTypeOf("number");
  });

  it("applies a per-route override independently of the default limiter", () => {
    const generousDefault = new RateLimiter({ windowMs: 1000, max: 1000 }, () => 0);
    const guard = new RateLimitGuard(stubReflector({ windowMs: 1000, max: 1 }), generousDefault);
    expect(guard.canActivate(makeContext().context)).toBe(true);
    expect(() => guard.canActivate(makeContext().context)).toThrow(RateLimitError);
  });
});
