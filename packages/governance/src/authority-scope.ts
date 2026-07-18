/**
 * The domain of authority a delegation confers. Financial scopes typically carry a
 * monetary approval limit; others gate approval of a category of decision. `other`
 * accommodates institution-specific authorities.
 */
export type AuthorityScope =
  | "financial"
  | "procurement"
  | "hr"
  | "academic"
  | "administrative"
  | "admissions"
  | "general"
  | "other";

export const AUTHORITY_SCOPES: readonly AuthorityScope[] = [
  "financial",
  "procurement",
  "hr",
  "academic",
  "administrative",
  "admissions",
  "general",
  "other",
];

/** Type guard for an {@link AuthorityScope}. */
export const isAuthorityScope = (value: string): value is AuthorityScope =>
  (AUTHORITY_SCOPES as readonly string[]).includes(value);
