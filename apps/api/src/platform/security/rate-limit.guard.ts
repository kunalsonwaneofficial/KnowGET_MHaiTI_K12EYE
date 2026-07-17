import { RateLimitError } from "@knowget/exceptions";
import { RateLimiter } from "@knowget/security";
import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthenticatedRequest } from "./authenticated-request";
import { RATE_LIMIT_KEY, type RateLimitMetadata } from "./decorators";
import { RATE_LIMITER } from "./security.tokens";

interface ResponseLike {
  setHeader(name: string, value: string | number): void;
}

/**
 * Fixed-window rate limiting keyed by client address. The global default
 * limiter (a shared per-client budget) applies to every route; a route may
 * tighten it with {@link RateLimit}, which gets a dedicated limiter instance
 * (cached per route). Emits `X-RateLimit-*` headers and, on breach, a
 * `Retry-After` header plus {@link RateLimitError} (HTTP 429).
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly perRoute = new Map<string, RateLimiter>();

  constructor(
    private readonly reflector: Reflector,
    @Inject(RATE_LIMITER) private readonly defaultLimiter: RateLimiter,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const limiter = this.limiterFor(context);
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<ResponseLike>();

    const result = limiter.check(this.clientKey(request));

    response.setHeader("X-RateLimit-Limit", limiter.limit);
    response.setHeader("X-RateLimit-Remaining", result.remaining);
    response.setHeader("X-RateLimit-Reset", Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((result.resetAt - Date.now()) / 1000));
      response.setHeader("Retry-After", retryAfterSeconds);
      throw new RateLimitError("Rate limit exceeded");
    }
    return true;
  }

  private limiterFor(context: ExecutionContext): RateLimiter {
    const override = this.reflector.getAllAndOverride<RateLimitMetadata>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!override) {
      return this.defaultLimiter;
    }
    const routeKey = `${context.getClass().name}.${context.getHandler().name}`;
    let limiter = this.perRoute.get(routeKey);
    if (!limiter) {
      limiter = new RateLimiter(override);
      this.perRoute.set(routeKey, limiter);
    }
    return limiter;
  }

  private clientKey(request: AuthenticatedRequest): string {
    const forwarded = request.headers["x-forwarded-for"];
    const firstHop = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0]?.trim();
    return firstHop || request.ip || request.socket?.remoteAddress || "unknown";
  }
}
