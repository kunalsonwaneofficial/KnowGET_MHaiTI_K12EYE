/**
 * Lifecycle of a unit plan — a sequence of related learning experiences. A `draft` is being
 * authored; an `active` unit is the one lessons are planned against; an `archived` unit is
 * retired and immutable.
 */
export const UNIT_PLAN_STATUSES = ["draft", "active", "archived"] as const;

export type UnitPlanStatus = (typeof UNIT_PLAN_STATUSES)[number];

/** Narrow an arbitrary string to a {@link UnitPlanStatus}. */
export const isUnitPlanStatus = (value: string): value is UnitPlanStatus =>
  (UNIT_PLAN_STATUSES as readonly string[]).includes(value);
