import type { Maybe } from "./common";

/** Returns true when a value is neither `null` nor `undefined`. */
export function isDefined<T>(value: Maybe<T>): value is T {
  return value !== null && value !== undefined;
}

/** Returns true when a value is `null` or `undefined`. */
export function isNil<T>(value: Maybe<T>): value is null | undefined {
  return value === null || value === undefined;
}

/** Returns true when a value is a non-empty string (after trimming). */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Type-safe own-property check that narrows the key. */
export function hasOwn<T extends object, K extends PropertyKey>(
  obj: T,
  key: K,
): obj is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Exhaustiveness helper. Placing `assertNever(x)` in the `default` branch of a
 * switch makes the compiler fail if a union member is left unhandled.
 */
export function assertNever(value: never, message?: string): never {
  throw new Error(message ?? `Unexpected value: ${String(value)}`);
}
