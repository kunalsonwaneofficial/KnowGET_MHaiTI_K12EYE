import type { ISODateString, Uuid } from "@knowget/types";

/**
 * Lifecycle of an evaluation — the auditable marking workflow. A `draft` is being marked;
 * submitting it moves it to `submitted`; a moderator moves it to `moderated`; final sign-off
 * makes it `approved`. Re-evaluation reopens an approved evaluation back to a draft (recorded in
 * the audit log), so results are always traceable.
 */
export const EVALUATION_STATUSES = ["draft", "submitted", "moderated", "approved"] as const;

export type EvaluationStatus = (typeof EVALUATION_STATUSES)[number];

/** How the evaluation is performed — free-form manual marking or structured rubric scoring. */
export const EVALUATION_TYPES = ["manual", "rubric_based"] as const;

export type EvaluationType = (typeof EVALUATION_TYPES)[number];

/** A score awarded against one rubric criterion. */
export interface RubricScore {
  readonly criterion: string;
  readonly score: number;
}

/**
 * One entry in an evaluation's append-only audit history — the workflow action taken, who took
 * it, when, and an optional note. The full evaluation lifecycle (submit / moderate / approve /
 * reopen) is reconstructable, satisfying the contract's auditability requirement.
 */
export interface EvaluationEntry {
  readonly action: string;
  readonly actor: Uuid | null;
  readonly at: ISODateString;
  readonly note: string | null;
}

/** Narrow an arbitrary string to an {@link EvaluationStatus}. */
export const isEvaluationStatus = (value: string): value is EvaluationStatus =>
  (EVALUATION_STATUSES as readonly string[]).includes(value);
