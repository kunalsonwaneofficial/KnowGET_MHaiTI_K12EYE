import type { Uuid } from "@knowget/types";

/**
 * The kind of assignment. All share the same publish → track-submissions lifecycle;
 * **evaluation and grading are an Assessment-platform (P2-D10) concern** and an explicit
 * P2-D09 non-goal — an assignment here schedules and tracks work, it does not score it.
 */
export const ASSIGNMENT_TYPES = [
  "homework",
  "project",
  "practice",
  "reading",
  "collaborative",
] as const;

export type AssignmentType = (typeof ASSIGNMENT_TYPES)[number];

/** Lifecycle of an assignment. Submissions are tracked only while `published`. */
export const ASSIGNMENT_STATUSES = ["draft", "published", "closed"] as const;

export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

/** Whether a tracked submission arrived on time, arrived late, or is still outstanding. */
export const SUBMISSION_STATUSES = ["submitted", "late", "missing"] as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/** Narrow an arbitrary string to an {@link AssignmentType}. */
export const isAssignmentType = (value: string): value is AssignmentType =>
  (ASSIGNMENT_TYPES as readonly string[]).includes(value);

/**
 * A single learner's submission record on an assignment — completion tracking only, never a
 * mark. `submittedAt` is null while the submission is outstanding (`missing`).
 */
export interface AssignmentSubmission {
  readonly studentId: Uuid;
  readonly status: SubmissionStatus;
  /** A user-supplied timestamp in ISO form, or null while outstanding (plain string, not branded). */
  readonly submittedAt: string | null;
  readonly note: string | null;
}
