import type { GradeIntakeView, IntakeCapacity, IntakeSummary } from "./admissions-view";

/**
 * The pure intake engine — values a grade's seat intake: how many places are confirmed against its capacity,
 * how many remain, whether it is over-subscribed, and a fill percent. A capacity of zero means
 * "not capacity-tracked" (no cap): remaining zero, over-subscribed false, fill percent zero. Pure,
 * deterministic and clock-free. Built and tested before any aggregate depends on it.
 */
export function computeIntakeCapacity(capacity: number, confirmedCount: number): IntakeCapacity {
  const cap = Math.max(0, capacity);
  const confirmed = Math.max(0, confirmedCount);
  const capped = cap > 0;
  return {
    capacity: cap,
    confirmedCount: confirmed,
    remaining: capped ? Math.max(0, cap - confirmed) : 0,
    overSubscribed: capped && confirmed > cap,
    fillPercent: capped ? Math.round((Math.min(confirmed, cap) / cap) * 100) : 0,
  };
}

/**
 * The pure intake-rollup engine — summarizes a cycle's per-grade intakes into a cycle picture: the grade
 * count, the total capacity, the total confirmed and the overall fill percent (capped at 100, empty-safe).
 * Pure and deterministic.
 */
export function summarizeIntake(grades: readonly GradeIntakeView[]): IntakeSummary {
  let totalCapacity = 0;
  let totalConfirmed = 0;
  for (const grade of grades) {
    totalCapacity += Math.max(0, grade.capacity);
    totalConfirmed += Math.max(0, grade.confirmedCount);
  }
  return {
    gradeCount: grades.length,
    totalCapacity,
    totalConfirmed,
    fillPercent:
      totalCapacity > 0
        ? Math.round((Math.min(totalConfirmed, totalCapacity) / totalCapacity) * 100)
        : 0,
  };
}
