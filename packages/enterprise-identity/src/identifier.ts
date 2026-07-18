/**
 * Login identifiers — the values a person authenticates with. An identity
 * account carries one or more; each is unique within its tenant. Values are
 * stored as entered but compared/de-duplicated on a normalized form so that
 * `Ada@School.edu` and `ada@school.edu` are the same identifier.
 */

/** The kinds of value an account can log in with. */
export type LoginIdentifierType = "username" | "email" | "mobile";

export interface LoginIdentifier {
  readonly type: LoginIdentifierType;
  /** The value as entered (display form). */
  readonly value: string;
}

/**
 * Normalize an identifier value for comparison and uniqueness:
 * usernames/emails are trimmed and lower-cased; mobile numbers keep only their
 * digits and an optional leading `+`. The original value is preserved on the
 * identifier; only the derived key uses this form.
 */
export function normalizeIdentifierValue(type: LoginIdentifierType, value: string): string {
  const trimmed = value.trim();
  if (type === "mobile") {
    const digits = trimmed.replace(/[^\d]/g, "");
    return trimmed.startsWith("+") ? `+${digits}` : digits;
  }
  return trimmed.toLowerCase();
}

/** A deterministic, storable key for an identifier (`type:normalized-value`). */
export function identifierKey(identifier: LoginIdentifier): string {
  return `${identifier.type}:${normalizeIdentifierValue(identifier.type, identifier.value)}`;
}

/** The set of identifier keys for a collection (used for indexed lookup + dedup). */
export function identifierKeys(identifiers: readonly LoginIdentifier[]): string[] {
  return identifiers.map(identifierKey);
}

/** True when two identifiers are the same after normalization. */
export function sameIdentifier(a: LoginIdentifier, b: LoginIdentifier): boolean {
  return identifierKey(a) === identifierKey(b);
}

/** True when `identifier` is already present (by normalized key) in the list. */
export function hasIdentifier(
  identifiers: readonly LoginIdentifier[],
  identifier: LoginIdentifier,
): boolean {
  const key = identifierKey(identifier);
  return identifiers.some((existing) => identifierKey(existing) === key);
}
