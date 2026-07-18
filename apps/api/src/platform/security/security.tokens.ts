/**
 * Dependency-injection tokens for the security layer. Kept in a dedicated file
 * so guards, providers and the module can share them without circular imports.
 */
export const KEY_RING = Symbol("KEY_RING");
export const SECURITY_CONFIG = Symbol("SECURITY_CONFIG");
export const AUTHORIZATION_ENGINE = Symbol("AUTHORIZATION_ENGINE");
export const AUTHENTICATION_ENGINE = Symbol("AUTHENTICATION_ENGINE");
export const IDENTITY_REPOSITORY = Symbol("IDENTITY_REPOSITORY");
export const SESSION_MANAGER = Symbol("SESSION_MANAGER");
export const SECURITY_AUDIT = Symbol("SECURITY_AUDIT");
export const PRINCIPAL_RESOLVER = Symbol("PRINCIPAL_RESOLVER");
export const RATE_LIMITER = Symbol("RATE_LIMITER");

/** Exchanges credentials for tokens (memory or persisted, chosen by env). */
export const AUTHENTICATOR = Symbol("AUTHENTICATOR");

/** Persisted-mode overrides, provided by `PersistedSecurityModule` when enabled;
 * absent (⇒ memory fallback) otherwise. Injected `@Optional` by the security module. */
export const PERSISTED_AUTHENTICATOR = Symbol("PERSISTED_AUTHENTICATOR");
export const PERSISTED_PRINCIPAL_RESOLVER = Symbol("PERSISTED_PRINCIPAL_RESOLVER");

/** Internal: the single seeded security graph the other providers derive from. */
export const SECURITY_GRAPH = Symbol("SECURITY_GRAPH");
