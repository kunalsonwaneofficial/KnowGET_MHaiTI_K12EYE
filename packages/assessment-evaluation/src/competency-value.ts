import type { ISODateString, Uuid } from "@knowget/types";

/**
 * A learner's mastery of a competency, on an ordinal scale from `not_assessed` through
 * `emerging`, `developing`, `proficient`, `advanced` to `mastered`. Mastery is tracked
 * **independently of raw marks** (the P2-D10 definition of done) — it is set from evidence and
 * evaluation judgement, not derived from a percentage.
 */
export const MASTERY_LEVELS = [
  "not_assessed",
  "emerging",
  "developing",
  "proficient",
  "advanced",
  "mastered",
] as const;

export type MasteryLevel = (typeof MASTERY_LEVELS)[number];

/**
 * The mastery of one competency for a learner — the level, the learning-evidence records
 * (P2-D09) that support it, and when it was last updated.
 */
export interface CompetencyMastery {
  readonly competencyId: string;
  readonly name: string;
  readonly masteryLevel: MasteryLevel;
  readonly evidenceRefs: readonly Uuid[];
  readonly updatedAt: ISODateString;
}

/** One entry in a competency profile's append-only growth trajectory. */
export interface MasteryChange {
  readonly competencyId: string;
  readonly fromLevel: MasteryLevel;
  readonly toLevel: MasteryLevel;
  readonly changedAt: ISODateString;
  readonly note: string | null;
}

/** The ordinal rank of a mastery level (0 = not_assessed … 5 = mastered). */
export const masteryRank = (level: MasteryLevel): number => MASTERY_LEVELS.indexOf(level);

/** A normalised 0–1 mastery score for the level (not_assessed = 0 … mastered = 1). */
export const masteryScore = (level: MasteryLevel): number =>
  masteryRank(level) / (MASTERY_LEVELS.length - 1);

/** Whether the level is proficient or above (proficient / advanced / mastered). */
export const isProficientOrAbove = (level: MasteryLevel): boolean =>
  masteryRank(level) >= masteryRank("proficient");

/** Narrow an arbitrary string to a {@link MasteryLevel}. */
export const isMasteryLevel = (value: string): value is MasteryLevel =>
  (MASTERY_LEVELS as readonly string[]).includes(value);
