import { Global, Module, type Provider } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { PermissionsGuard } from "./permissions.guard";
import { RateLimitGuard } from "./rate-limit.guard";
import { SecurityController } from "./security.controller";
import { loadSecurityEnv } from "./security.env";
import { buildSecurityGraph, type SecurityGraph } from "./security.providers";
import {
  AUTHENTICATION_ENGINE,
  AUTHORIZATION_ENGINE,
  IDENTITY_REPOSITORY,
  KEY_RING,
  PRINCIPAL_RESOLVER,
  RATE_LIMITER,
  SECURITY_AUDIT,
  SECURITY_CONFIG,
  SECURITY_GRAPH,
  SESSION_MANAGER,
} from "./security.tokens";

/** Expose one field of the shared graph under its own injection token. */
const fromGraph = (token: symbol, select: (graph: SecurityGraph) => unknown): Provider => ({
  provide: token,
  useFactory: (graph: SecurityGraph) => select(graph),
  inject: [SECURITY_GRAPH],
});

const graphProvider: Provider = {
  provide: SECURITY_GRAPH,
  useFactory: (): Promise<SecurityGraph> => buildSecurityGraph(loadSecurityEnv()),
};

/**
 * The security layer. Seeds and provides the security graph (keys, policy,
 * RBAC/ABAC, identities, sessions, audit, authentication, principals, rate
 * limiting) and installs the global guard stack — evaluated in order: rate
 * limit → JWT authentication → permissions. Global so Phase-2 domain modules
 * can inject the engines directly.
 */
@Global()
@Module({
  controllers: [SecurityController],
  providers: [
    graphProvider,
    fromGraph(KEY_RING, (g) => g.keyRing),
    fromGraph(SECURITY_CONFIG, (g) => g.config),
    fromGraph(AUTHORIZATION_ENGINE, (g) => g.authorization),
    fromGraph(AUTHENTICATION_ENGINE, (g) => g.authentication),
    fromGraph(IDENTITY_REPOSITORY, (g) => g.identities),
    fromGraph(SESSION_MANAGER, (g) => g.sessions),
    fromGraph(SECURITY_AUDIT, (g) => g.audit),
    fromGraph(PRINCIPAL_RESOLVER, (g) => g.principals),
    fromGraph(RATE_LIMITER, (g) => g.rateLimiter),
    // Order is significant: rate limiting runs first, then authentication, then
    // authorization (which relies on the principal the auth guard attaches).
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [
    KEY_RING,
    SECURITY_CONFIG,
    AUTHORIZATION_ENGINE,
    AUTHENTICATION_ENGINE,
    IDENTITY_REPOSITORY,
    SESSION_MANAGER,
    SECURITY_AUDIT,
    PRINCIPAL_RESOLVER,
  ],
})
export class SecurityModule {}
