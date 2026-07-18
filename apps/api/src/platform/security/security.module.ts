import { Global, Module, type Provider } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { KeyValueModule } from "../keyvalue/keyvalue.module";
import { EngineAuthenticator, type Authenticator } from "./authenticator";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { PermissionsGuard } from "./permissions.guard";
import type { PrincipalResolver } from "./principal-resolver";
import { RateLimitGuard } from "./rate-limit.guard";
import { SecurityController } from "./security.controller";
import { loadSecurityEnv } from "./security.env";
import { buildSecurityGraph, type SecurityGraph } from "./security.providers";
import {
  AUTHENTICATION_ENGINE,
  AUTHENTICATOR,
  AUTHORIZATION_ENGINE,
  DEFAULT_RATE_LIMIT,
  IDENTITY_REPOSITORY,
  KEY_RING,
  PERSISTED_AUTHENTICATOR,
  PERSISTED_PRINCIPAL_RESOLVER,
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
 * Principal resolver + authenticator select the persisted implementations when
 * `PersistedSecurityModule` provides them (SECURITY_STORE=persisted), and fall
 * back to the in-memory bootstrap graph otherwise. The `@Optional` persisted
 * tokens are absent in memory mode, so the default path is unchanged.
 */
const principalResolverProvider: Provider = {
  provide: PRINCIPAL_RESOLVER,
  useFactory: (graph: SecurityGraph, persisted?: PrincipalResolver) =>
    persisted ?? graph.principals,
  inject: [SECURITY_GRAPH, { token: PERSISTED_PRINCIPAL_RESOLVER, optional: true }],
};

const authenticatorProvider: Provider = {
  provide: AUTHENTICATOR,
  useFactory: (graph: SecurityGraph, persisted?: Authenticator) =>
    persisted ?? new EngineAuthenticator(graph.authentication, graph.config, graph.sessions),
  inject: [SECURITY_GRAPH, { token: PERSISTED_AUTHENTICATOR, optional: true }],
};

/** The global default per-client rate-limit budget, from security env. */
const defaultRateLimitProvider: Provider = {
  provide: DEFAULT_RATE_LIMIT,
  useFactory: () => {
    const env = loadSecurityEnv();
    return { windowMs: env.SECURITY_RATE_LIMIT_WINDOW_MS, max: env.SECURITY_RATE_LIMIT_MAX };
  },
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
  imports: [KeyValueModule],
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
    principalResolverProvider,
    authenticatorProvider,
    defaultRateLimitProvider,
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
