/**
 * A lightweight `Result` type for explicit success/failure handling without
 * throwing. Used pervasively by domain and application services so that error
 * paths are part of the type signature rather than hidden control flow.
 */
export type Result<T, E = Error> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

/** Construct a successful result. */
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

/** Construct a failed result. */
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/** Type-guard for the success branch. */
export const isOk = <T, E>(result: Result<T, E>): result is { ok: true; value: T } => result.ok;

/** Type-guard for the failure branch. */
export const isErr = <T, E>(result: Result<T, E>): result is { ok: false; error: E } => !result.ok;

/** Transform the success value, leaving failures untouched. */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/** Transform the error value, leaving successes untouched. */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(fn(result.error));
}

/** Return the success value or throw the contained error. */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  throw result.error instanceof Error ? result.error : new Error(String(result.error));
}

/** Return the success value or a fallback. */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}
