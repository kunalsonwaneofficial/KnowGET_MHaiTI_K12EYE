import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import { Body, Controller, Get, HttpCode, Inject, Post } from "@nestjs/common";
import { z } from "zod";
import type { Authenticator } from "./authenticator";
import {
  CurrentPrincipal,
  CurrentSession,
  Public,
  RateLimit,
  RequirePermissions,
  type SessionContext,
} from "./decorators";
import { AUTHENTICATOR } from "./security.tokens";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  device: z.string().optional(),
  /** Tenant to sign in to. Required in persisted mode; ignored in memory mode. */
  tenant: z.string().uuid().optional(),
});

interface LoginResponse {
  readonly tokenType: "Bearer";
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresInMs: number;
}

/**
 * Reference endpoints that exercise the security middleware end to end:
 * authenticate to obtain a token, read the authenticated principal, and hit a
 * permission-gated route. These prove the guard stack (rate limit → JWT auth →
 * permissions) is wired correctly; Phase-2 domain modules follow the same shape.
 */
@Controller("secure")
export class SecurityController {
  constructor(@Inject(AUTHENTICATOR) private readonly authenticator: Authenticator) {}

  /** Exchange credentials for an access token. Public but tightly rate-limited. */
  @Public()
  @RateLimit({ windowMs: 60_000, max: 5 })
  @Post("login")
  @HttpCode(200)
  async login(@Body() body: unknown): Promise<LoginResponse> {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Invalid login request", {
        details: { issues: parsed.error.issues },
      });
    }
    const result = await this.authenticator.login({
      email: parsed.data.email,
      password: parsed.data.password,
      ...(parsed.data.device !== undefined ? { device: parsed.data.device } : {}),
      ...(parsed.data.tenant !== undefined ? { tenant: parsed.data.tenant } : {}),
    });
    return {
      tokenType: "Bearer",
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresInMs: result.expiresInMs,
    };
  }

  /**
   * End the current session (sign out). Revokes the session and records the
   * presented token as revoked, so both are rejected on the next request
   * (persisted mode). Requires a valid bearer token.
   */
  @Post("logout")
  @HttpCode(204)
  async logout(@CurrentSession() session: SessionContext): Promise<void> {
    if (!session.sessionId) {
      return;
    }
    await this.authenticator.logout({
      sessionId: session.sessionId,
      ...(session.tokenId !== undefined ? { tokenId: session.tokenId } : {}),
      ...(session.tenantId !== undefined ? { tenant: session.tenantId } : {}),
    });
  }

  /** Return the authenticated principal (requires a valid bearer token). */
  @Get("whoami")
  whoami(@CurrentPrincipal() principal: Principal): Principal {
    return principal;
  }

  /** A permission-gated route demonstrating RBAC enforcement. */
  @RequirePermissions("admin:read")
  @Get("admin")
  admin(@CurrentPrincipal("id") principalId: string): { ok: true; principalId: string } {
    return { ok: true, principalId };
  }
}
