/** Assert a condition, throwing with an optional message when it is falsy. */
export function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) {
    throw new Error(message ?? "Assertion failed");
  }
}

/** Assert that a value is neither `null` nor `undefined`. */
export function assertDefined<T>(value: T, message?: string): asserts value is NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error(message ?? "Expected value to be defined");
  }
}
