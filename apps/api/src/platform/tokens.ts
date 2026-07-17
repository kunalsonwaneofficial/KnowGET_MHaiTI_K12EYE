/** Dependency-injection tokens for platform services (kept separate to avoid
 * circular imports between the module and its providers). */
export const KERNEL = Symbol("KERNEL");
export const APP_CONFIG = Symbol("APP_CONFIG");
export const FEATURE_FLAGS = Symbol("FEATURE_FLAGS");
export const DATABASE = Symbol("DATABASE");
