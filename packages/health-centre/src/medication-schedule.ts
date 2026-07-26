import type { MedicationSchedule } from "./health-centre-view";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole days from `from` to `to` (both `YYYY-MM-DD`, parsed as UTC midnight, so the difference is an exact
 * multiple of a day). Negative when `to` precedes `from`.
 */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / MS_PER_DAY);
}

/**
 * The pure medication-schedule engine — from a prescription's start date, its doses-per-day, its duration
 * in days and the number of doses administered so far, derive as of a date: the total doses the course
 * prescribes, the doses administered and remaining, the doses due by now, how many of those are overdue
 * (due but not yet given), and whether the course is complete or still active. Pure, deterministic and
 * clock-free (the caller passes the as-of date). Doses are integers — there is no money here.
 *
 * Dosing runs on calendar days: day one is the start date, so a course beginning today already owes today's
 * doses; before the start date nothing is due, and after the course ends every dose is due. Built and
 * tested before any aggregate depends on it.
 */
export function computeMedicationSchedule(
  startDate: string,
  frequencyPerDay: number,
  durationDays: number,
  dosesAdministered: number,
  asOfDate: string,
): MedicationSchedule {
  const totalDoses = frequencyPerDay * durationDays;
  const elapsed = daysBetween(startDate, asOfDate);
  const daysCounted = elapsed < 0 ? 0 : Math.min(durationDays, elapsed + 1);
  const dosesDue = frequencyPerDay * daysCounted;
  const isComplete = dosesAdministered >= totalDoses;
  return {
    totalDoses,
    dosesAdministered,
    dosesRemaining: Math.max(0, totalDoses - dosesAdministered),
    dosesDue,
    overdueDoses: Math.max(0, dosesDue - dosesAdministered),
    isComplete,
    isActive: !isComplete && elapsed >= 0 && elapsed < durationDays,
  };
}
