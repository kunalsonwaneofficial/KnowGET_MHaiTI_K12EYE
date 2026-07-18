import { AuthorizationEngine } from "@knowget/authorization";
import { InMemoryRoleStore, type Role } from "@knowget/authorization";
import { AuthenticationEngine } from "@knowget/authentication";
import { InMemorySessionRepository, SessionManager } from "@knowget/authentication";
import { ConfigurationError } from "@knowget/exceptions";
import {
  activateIdentity,
  createIdentity,
  type IdentityRepository,
  InMemoryIdentityRepository,
  setCredential,
} from "@knowget/identity";
import {
  defaultSecurityConfig,
  KeyRing,
  RateLimiter,
  SecurityAuditLogger,
  type SecurityConfig,
} from "@knowget/security";
import { LocalKmsClient } from "./kms/kms-client";
import { readKek, resolveEnvelopeKeyRing } from "./kms/key-custody";
import { InMemoryPrincipalResolver, type PrincipalResolver } from "./principal-resolver";
import type { SecurityEnv } from "./security.env";

/** Bootstrap roles seeded on first boot. */
const BOOTSTRAP_ROLES: readonly Role[] = [{ name: "administrator", permissions: ["*"] }];

const DEV_BOOTSTRAP_EMAIL = "admin@knowget.local";
const DEV_BOOTSTRAP_PASSWORD = "ChangeMe!Bootstrap1";

/** The fully-wired security object graph shared across the security providers. */
export interface SecurityGraph {
  readonly keyRing: KeyRing;
  readonly config: SecurityConfig;
  readonly roleStore: InMemoryRoleStore;
  readonly authorization: AuthorizationEngine;
  readonly identities: IdentityRepository;
  readonly sessions: SessionManager;
  readonly audit: SecurityAuditLogger;
  readonly authentication: AuthenticationEngine;
  readonly principals: PrincipalResolver;
  readonly rateLimiter: RateLimiter;
  readonly bootstrap: { readonly identityId: string; readonly email: string };
}

/**
 * Resolve the JWT signing key ring per the custody mode (TD-11). `envelope` unwraps
 * a KMS-wrapped key so it is never held in plaintext; `plaintext` takes the key from
 * `SECURITY_JWT_SECRET`, requiring it in production rather than booting ephemeral.
 */
async function resolveKeyRing(env: SecurityEnv): Promise<KeyRing> {
  if (env.SECURITY_KEY_CUSTODY === "envelope") {
    if (!env.SECURITY_KMS_MASTER_KEY || !env.SECURITY_JWT_KEY_WRAPPED) {
      throw new ConfigurationError(
        "SECURITY_KEY_CUSTODY=envelope requires SECURITY_KMS_MASTER_KEY and SECURITY_JWT_KEY_WRAPPED",
      );
    }
    const kms = new LocalKmsClient(readKek(env.SECURITY_KMS_MASTER_KEY));
    return resolveEnvelopeKeyRing(env.SECURITY_JWT_KEY_WRAPPED, kms);
  }
  if (env.SECURITY_JWT_SECRET) {
    return new KeyRing(Buffer.from(env.SECURITY_JWT_SECRET, "utf8"));
  }
  if (env.NODE_ENV === "production") {
    throw new ConfigurationError(
      "SECURITY_JWT_SECRET is required in production (refusing to boot with an ephemeral key)",
    );
  }
  // Development/test: an ephemeral per-process key is generated.
  return new KeyRing();
}

/** Resolve bootstrap-admin credentials, requiring explicit values in production. */
function resolveBootstrapCredentials(env: SecurityEnv): { email: string; password: string } {
  if (env.SECURITY_BOOTSTRAP_EMAIL && env.SECURITY_BOOTSTRAP_PASSWORD) {
    return { email: env.SECURITY_BOOTSTRAP_EMAIL, password: env.SECURITY_BOOTSTRAP_PASSWORD };
  }
  if (env.NODE_ENV === "production") {
    throw new ConfigurationError(
      "SECURITY_BOOTSTRAP_EMAIL and SECURITY_BOOTSTRAP_PASSWORD are required in production",
    );
  }
  return { email: DEV_BOOTSTRAP_EMAIL, password: DEV_BOOTSTRAP_PASSWORD };
}

/**
 * Constructs and seeds the complete security graph: signing keys, policy config,
 * RBAC store and authorization engine, the identity store seeded with a
 * bootstrap administrator, session management, the tamper-evident audit log, the
 * authentication engine, the principal resolver, and the default rate limiter.
 *
 * Built once (a single async factory) so the bootstrap identity's id flows into
 * both the identity store and the principal/role assignment consistently.
 */
export async function buildSecurityGraph(env: SecurityEnv): Promise<SecurityGraph> {
  const keyRing = await resolveKeyRing(env);
  const config: SecurityConfig = defaultSecurityConfig;

  const roleStore = new InMemoryRoleStore(BOOTSTRAP_ROLES);
  const authorization = new AuthorizationEngine(roleStore);

  const identities = new InMemoryIdentityRepository();
  const sessions = new SessionManager(new InMemorySessionRepository(), config.session);
  const audit = new SecurityAuditLogger();

  const { email, password } = resolveBootstrapCredentials(env);
  const admin = activateIdentity(
    createIdentity({
      identifiers: [{ type: "email", value: email }],
      credentialHash: setCredential(password),
    }),
  );
  await identities.save(admin);

  const authentication = new AuthenticationEngine({
    identities,
    sessions,
    audit,
    config,
    signingKey: keyRing.current().material,
  });

  const principals = new InMemoryPrincipalResolver([
    { identityId: admin.id, roles: ["administrator"] },
  ]);

  const rateLimiter = new RateLimiter({
    windowMs: env.SECURITY_RATE_LIMIT_WINDOW_MS,
    max: env.SECURITY_RATE_LIMIT_MAX,
  });

  return {
    keyRing,
    config,
    roleStore,
    authorization,
    identities,
    sessions,
    audit,
    authentication,
    principals,
    rateLimiter,
    bootstrap: { identityId: admin.id, email },
  };
}
