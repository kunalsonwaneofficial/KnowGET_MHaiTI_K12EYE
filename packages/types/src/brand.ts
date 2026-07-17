/**
 * Nominal ("branded") typing utility. Lets us create distinct types that are
 * structurally strings/numbers at runtime but are not interchangeable at
 * compile time — e.g. a `TenantId` cannot be passed where a `UserId` is wanted.
 */
declare const __brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [__brand]: B };

/** A UUID string. */
export type Uuid = Brand<string, "Uuid">;

/** Identifier of a tenant (institution / institution group). */
export type TenantId = Brand<string, "TenantId">;

/** Identifier of a correlation across a logical operation (tracing). */
export type CorrelationId = Brand<string, "CorrelationId">;

/** An ISO-8601 timestamp string (UTC). */
export type ISODateString = Brand<string, "ISODateString">;
