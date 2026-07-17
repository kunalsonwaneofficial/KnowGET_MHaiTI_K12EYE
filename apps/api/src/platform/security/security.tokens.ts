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

/** Internal: the single seeded security graph the other providers derive from. */
export const SECURITY_GRAPH = Symbol("SECURITY_GRAPH");
