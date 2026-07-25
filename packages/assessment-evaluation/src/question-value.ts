import type { ISODateString, Uuid } from "@knowget/types";

/** Difficulty of a question. */
export const DIFFICULTY_LEVELS = ["easy", "medium", "hard"] as const;

export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

/** Bloom's taxonomy cognitive level a question targets. */
export const BLOOM_LEVELS = [
  "remember",
  "understand",
  "apply",
  "analyze",
  "evaluate",
  "create",
] as const;

export type BloomLevel = (typeof BLOOM_LEVELS)[number];

/** The form a question takes. */
export const QUESTION_TYPES = [
  "mcq",
  "true_false",
  "short_answer",
  "long_answer",
  "practical",
  "oral",
  "match",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Lifecycle of a question bank. Only an `active` bank is offered for reuse. */
export const QUESTION_BANK_STATUSES = ["draft", "active", "archived"] as const;

export type QuestionBankStatus = (typeof QUESTION_BANK_STATUSES)[number];

/**
 * One question in a bank — mapped to Bloom's taxonomy, competencies and curriculum learning
 * outcomes so a bank can be searched, categorised and reused. Carries its own marks and
 * difficulty.
 */
export interface Question {
  readonly id: Uuid;
  readonly text: string;
  readonly questionType: QuestionType;
  readonly difficulty: DifficultyLevel;
  readonly bloomLevel: BloomLevel | null;
  readonly marks: number;
  readonly competencies: readonly string[];
  readonly learningOutcomeIds: readonly Uuid[];
}

/** One entry in a question bank's append-only revision log. */
export interface QuestionBankRevision {
  readonly version: number;
  readonly note: string;
  readonly revisedAt: ISODateString;
}

/** Narrow an arbitrary string to a {@link QuestionType}. */
export const isQuestionType = (value: string): value is QuestionType =>
  (QUESTION_TYPES as readonly string[]).includes(value);
