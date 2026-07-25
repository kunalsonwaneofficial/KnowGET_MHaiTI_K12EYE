import { EmptyCompetencyKeyError, EmptyCompetencyNameError } from "./errors";

/**
 * A single competency (professional-practice standard) within a {@link CompetencyFramework} — an
 * institution-defined skill faculty are observed and developed against. The `key` is a stable
 * identifier unique within its framework; observations rate against these keys.
 */
export interface Competency {
  readonly key: string;
  readonly name: string;
  readonly domain: string | null;
  readonly description: string | null;
}

export interface CompetencyInput {
  readonly key: string;
  readonly name: string;
  readonly domain?: string | null;
  readonly description?: string | null;
}

/** Normalize and validate a competency input into a {@link Competency} (trims; key/name required). */
export function makeCompetency(input: CompetencyInput): Competency {
  const key = input.key.trim();
  if (key.length === 0) {
    throw new EmptyCompetencyKeyError();
  }
  const name = input.name.trim();
  if (name.length === 0) {
    throw new EmptyCompetencyNameError();
  }
  return {
    key,
    name,
    domain: input.domain?.trim() || null,
    description: input.description?.trim() || null,
  };
}

/**
 * A competency rating captured in an {@link Observation} — the 1–4 practice rating for one
 * competency of the framework, with an optional evidence comment.
 */
export interface CompetencyRating {
  readonly competencyKey: string;
  readonly rating: number;
  readonly comment: string | null;
}

export interface CompetencyRatingInput {
  readonly competencyKey: string;
  readonly rating: number;
  readonly comment?: string | null;
}
