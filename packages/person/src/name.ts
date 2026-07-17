/** A person's name components. Culturally-neutral: only given/family are required. */
export interface PersonName {
  readonly given: string;
  readonly family: string;
  readonly middle?: string;
  /** A chosen name that overrides the given name for display. */
  readonly preferred?: string;
}

/** The name shown in most UI contexts: preferred (or given) followed by family. */
export function displayName(name: PersonName): string {
  return `${name.preferred ?? name.given} ${name.family}`.trim();
}

/** The full legal-style name: given [middle] family. */
export function fullName(name: PersonName): string {
  return [name.given, name.middle, name.family].filter((part) => part && part.length > 0).join(" ");
}
