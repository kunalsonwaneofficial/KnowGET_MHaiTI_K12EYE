/**
 * DI tokens for the distributed backend (TD-17/19/22). Kept separate so the
 * security and services modules can inject them without importing the module wiring.
 */
export const REDIS_CLIENT = Symbol("REDIS_CLIENT");
export const KEY_VALUE_STORE = Symbol("KEY_VALUE_STORE");
export const ASYNC_RATE_LIMITER = Symbol("ASYNC_RATE_LIMITER");
export const SESSION_VALIDITY_CACHE = Symbol("SESSION_VALIDITY_CACHE");
