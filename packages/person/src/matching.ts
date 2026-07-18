import type { PersonName } from "./name";

// Unicode combining diacritical marks (stripped after NFKD decomposition).
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/** Normalize a string for matching: strip diacritics/punctuation, lowercase, collapse spaces. */
export function normalizeForMatch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * A deterministic identity key from family name, given name and date of birth.
 * Two people sharing a match key are candidate duplicates (advisory — real
 * humans can collide; hence merge exists rather than a hard unique constraint).
 */
export function matchKey(name: PersonName, dateOfBirth: string | null): string {
  return [normalizeForMatch(name.family), normalizeForMatch(name.given), dateOfBirth ?? ""].join(
    "|",
  );
}
