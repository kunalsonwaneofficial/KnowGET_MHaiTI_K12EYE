/**
 * The kind of learning evidence captured. Evidence is a record that learning happened — a
 * student submission, a teacher's classroom observation, completion of an activity, a
 * portfolio artifact, or practical work. It is descriptive and, per the P2-D09 non-goals, is
 * never a grade or a mark.
 */
export const LEARNING_EVIDENCE_TYPES = [
  "submission",
  "observation",
  "activity_completion",
  "portfolio_artifact",
  "practical_work",
] as const;

export type LearningEvidenceType = (typeof LEARNING_EVIDENCE_TYPES)[number];

/**
 * The kind of instructional activity a piece of learning evidence is linked to, so every
 * evidence record is traceable back to the instruction that produced it (the P2-D09
 * definition of done).
 */
export const INSTRUCTIONAL_ACTIVITY_KINDS = [
  "lesson_plan",
  "classroom_session",
  "assignment",
] as const;

export type InstructionalActivityKind = (typeof INSTRUCTIONAL_ACTIVITY_KINDS)[number];

/** Narrow an arbitrary string to a {@link LearningEvidenceType}. */
export const isLearningEvidenceType = (value: string): value is LearningEvidenceType =>
  (LEARNING_EVIDENCE_TYPES as readonly string[]).includes(value);

/** Narrow an arbitrary string to an {@link InstructionalActivityKind}. */
export const isInstructionalActivityKind = (value: string): value is InstructionalActivityKind =>
  (INSTRUCTIONAL_ACTIVITY_KINDS as readonly string[]).includes(value);
