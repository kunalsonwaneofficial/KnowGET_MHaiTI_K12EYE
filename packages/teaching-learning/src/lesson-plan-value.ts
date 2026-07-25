import type { ISODateString } from "@knowget/types";

/**
 * Lifecycle of a lesson plan. A `draft` is authored freely; submitting it for review moves it
 * to `in_review`; approval makes it `approved` (the version teachers deliver); an `archived`
 * plan is retired. Lesson plans are version-controlled (a counter plus an append-only revision
 * log), like scheduling and attendance policies before them, so the delivered plan is always a
 * known version.
 */
export const LESSON_PLAN_STATUSES = ["draft", "in_review", "approved", "archived"] as const;

export type LessonPlanStatus = (typeof LESSON_PLAN_STATUSES)[number];

/** Narrow an arbitrary string to a {@link LessonPlanStatus}. */
export const isLessonPlanStatus = (value: string): value is LessonPlanStatus =>
  (LESSON_PLAN_STATUSES as readonly string[]).includes(value);

/**
 * One entry in a lesson plan's append-only revision log — the version it produced, a human
 * note, and when it was recorded.
 */
export interface LessonPlanRevision {
  readonly version: number;
  readonly note: string;
  readonly revisedAt: ISODateString;
}
