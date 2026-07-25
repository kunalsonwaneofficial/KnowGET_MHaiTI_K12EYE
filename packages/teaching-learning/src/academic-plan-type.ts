/**
 * The level an academic plan operates at. An **annual** plan spans the academic year; a
 * **term** plan a term/semester within it; a **department** plan the work of a subject
 * department; a **subject** plan the delivery of one subject. The level is descriptive scope,
 * not a different aggregate — every plan shares the same draft → published → archived
 * lifecycle.
 */
export const ACADEMIC_PLAN_TYPES = ["annual", "term", "department", "subject"] as const;

export type AcademicPlanType = (typeof ACADEMIC_PLAN_TYPES)[number];

/** Lifecycle of an academic plan. Only a `published` plan is authoritative for delivery. */
export const ACADEMIC_PLAN_STATUSES = ["draft", "published", "archived"] as const;

export type AcademicPlanStatus = (typeof ACADEMIC_PLAN_STATUSES)[number];

/** Narrow an arbitrary string to an {@link AcademicPlanType}. */
export const isAcademicPlanType = (value: string): value is AcademicPlanType =>
  (ACADEMIC_PLAN_TYPES as readonly string[]).includes(value);
