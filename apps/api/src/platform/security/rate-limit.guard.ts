import { RateLimitError } from "@knowget/exceptions";
import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AsyncRateLimiter, RateLimitOptions } from "../keyvalue/async-rate-limiter";
import { ASYNC_RATE_LIMITER } from "../keyvalue/keyvalue.tokens";
import type { AuthenticatedRequest } from "./authenticated-request";
import { RATE_LIMIT_KEY, type RateLimitMetadata } from "./decorators";
import { DEFAULT_RATE_LIMIT } from "./security.tokens";

interface ResponseLike {
  setHeader(name: string, value: string | number): void;
}

/**
 * Fixed-window rate limiting keyed by client address, over the injected
 * {@link AsyncRateLimiter}. With the Redis-backed store the budget is **shared
 * across replicas** (TD-17); with the in-memory store it is per-instance (the
 * Phase-1 behaviour). The global default budget applies to every route; a route may
 * tighten it with {@link RateLimit}, which gets its own counter namespace. Emits
 * `X-RateLimit-*` headers and, on breach, `Retry-After` + {@link RateLimitError} (429).
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ASYNC_RATE_LIMITER) private readonly limiter: AsyncRateLimiter,
    @Inject(DEFAULT_RATE_LIMIT) private readonly defaults: RateLimitOptions,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const override = this.reflector.getAllAndOverride<RateLimitMetadata>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const options: RateLimitOptions = override ?? this.defaults;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<ResponseLike>();

    // A per-route override gets its own counter namespace so it never shares the
    // global per-client budget.
    const scope = override ? `${context.getClass().name}.${context.getHandler().name}` : "global";
    const result = await this.limiter.check(`${scope}:${this.clientKey(request)}`, options);

    response.setHeader("X-RateLimit-Limit", options.max);
    response.setHeader("X-RateLimit-Remaining", result.remaining);
    response.setHeader("X-RateLimit-Reset", Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((result.resetAt - Date.now()) / 1000));
      response.setHeader("Retry-After", retryAfterSeconds);
      throw new RateLimitError("Rate limit exceeded");
    }
    return true;
  }

  private clientKey(request: AuthenticatedRequest): string {
    const forwarded = request.headers["x-forwarded-for"];
    const firstHop = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0]?.trim();
    return firstHop || request.ip || request.socket?.remoteAddress || "unknown";
  }
}
