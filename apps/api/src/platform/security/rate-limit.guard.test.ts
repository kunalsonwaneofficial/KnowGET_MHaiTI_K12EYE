import { RateLimitError } from "@knowget/exceptions";
import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import { KeyValueRateLimiter } from "../keyvalue/async-rate-limiter";
import { InMemoryKeyValueStore } from "../keyvalue/key-value-store";
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

/** A guard over a shared in-memory store (stands in for one replica's limiter). */
function makeGuard(
  override: RateLimitMetadata | undefined,
  defaults: { windowMs: number; max: number },
): RateLimitGuard {
  const limiter = new KeyValueRateLimiter(new InMemoryKeyValueStore(() => 0));
  return new RateLimitGuard(stubReflector(override), limiter, defaults);
}

describe("RateLimitGuard", () => {
  it("allows requests under the limit and emits rate-limit headers", async () => {
    const guard = makeGuard(undefined, { windowMs: 1000, max: 2 });
    const { context, headers } = makeContext();
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(headers.get("X-RateLimit-Limit")).toBe(2);
    expect(headers.get("X-RateLimit-Remaining")).toBe(1);
    expect(headers.get("X-RateLimit-Reset")).toBe(1);
  });

  it("blocks requests over the limit with a 429 and Retry-After", async () => {
    const guard = makeGuard(undefined, { windowMs: 1000, max: 1 });
    await expect(guard.canActivate(makeContext().context)).resolves.toBe(true);
    const { context, headers } = makeContext();
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(RateLimitError);
    expect(headers.get("Retry-After")).toBeTypeOf("number");
  });

  it("applies a per-route override independently of the default budget", async () => {
    const guard = makeGuard({ windowMs: 1000, max: 1 }, { windowMs: 1000, max: 1000 });
    await expect(guard.canActivate(makeContext().context)).resolves.toBe(true);
    await expect(guard.canActivate(makeContext().context)).rejects.toBeInstanceOf(RateLimitError);
  });
});
