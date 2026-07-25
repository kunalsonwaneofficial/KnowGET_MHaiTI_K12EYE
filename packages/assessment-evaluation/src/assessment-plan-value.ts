import type { Uuid } from "@knowget/types";

/**
 * The level an assessment plan operates at — the annual assessment calendar, a term/unit plan,
 * or classroom assessments. Descriptive scope; every plan shares the draft → published →
 * archived lifecycle.
 */
export const ASSESSMENT_PLAN_TYPES = ["annual", "term", "unit", "classroom"] as const;

export type AssessmentPlanType = (typeof ASSESSMENT_PLAN_TYPES)[number];

/** Lifecycle of an assessment plan. Only a `published` plan is authoritative. */
export const ASSESSMENT_PLAN_STATUSES = ["draft", "published", "archived"] as const;

export type AssessmentPlanStatus = (typeof ASSESSMENT_PLAN_STATUSES)[number];

/**
 * One planned assessment / examination in a plan's schedule — a title, its type, an optional
 * date, and an optional link to a scheduling slot (P2-D07) for the examination timetable.
 */
export interface PlannedAssessment {
  readonly title: string;
  readonly assessmentType: string;
  readonly date: string | null;
  readonly scheduleSlotId: Uuid | null;
}

/** Narrow an arbitrary string to an {@link AssessmentPlanType}. */
export const isAssessmentPlanType = (value: string): value is AssessmentPlanType =>
  (ASSESSMENT_PLAN_TYPES as readonly string[]).includes(value);
