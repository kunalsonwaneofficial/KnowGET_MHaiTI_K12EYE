/** A value that may be `null`. */
export type Nullable<T> = T | null;

/** A value that may be `null` or `undefined`. */
export type Maybe<T> = T | null | undefined;

/** Recursively marks all properties optional. */
export type DeepPartial<T> = T extends object ? { [P in keyof T]?: DeepPartial<T[P]> } : T;

/** Recursively marks all properties readonly. */
export type DeepReadonly<T> = T extends object
  ? { readonly [P in keyof T]: DeepReadonly<T[P]> }
  : T;

/** Extracts the resolved type of a Promise. */
export type Awaited<T> = T extends Promise<infer U> ? U : T;

/** A constructor type. */
export type Constructor<T = unknown> = new (...args: never[]) => T;
