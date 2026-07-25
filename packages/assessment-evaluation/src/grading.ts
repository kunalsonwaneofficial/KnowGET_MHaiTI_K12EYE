import type { GradeBand } from "./assessment-framework-value";

/**
 * The pure grading engine — deterministic marks → percentage → grade → GPA arithmetic driven by
 * a framework's grade bands. No aggregate dependency; exhaustively unit-testable. This is the
 * genuine computational core of the assessment platform (the seam academic records and reports
 * consume), built and tested before any aggregate depends on it.
 */

const round = (value: number): number => Math.round(value * 100) / 100;

/** The result of grading marks against a set of grade bands. */
export interface GradeResult {
  readonly percentage: number;
  readonly grade: string | null;
  readonly gpa: number | null;
}

/** Percentage for marks over a maximum — division-safe and clamped to 0–100 (two-decimal). */
export function computePercentage(marks: number, maxMarks: number): number {
  if (maxMarks <= 0) {
    return 0;
  }
  return round(Math.min(100, Math.max(0, (100 * marks) / maxMarks)));
}

/**
 * The grade band a percentage earns — the band with the highest `minPercentage` the percentage
 * satisfies. Returns null when no band matches (e.g. below the lowest band).
 */
export function gradeFor(percentage: number, bands: readonly GradeBand[]): GradeBand | null {
  let best: GradeBand | null = null;
  for (const band of bands) {
    if (
      percentage >= band.minPercentage &&
      (best === null || band.minPercentage > best.minPercentage)
    ) {
      best = band;
    }
  }
  return best;
}

/** Grade marks against a maximum and a set of bands — percentage, grade label and GPA together. */
export function gradeMarks(
  marks: number,
  maxMarks: number,
  bands: readonly GradeBand[],
): GradeResult {
  const percentage = computePercentage(marks, maxMarks);
  const band = gradeFor(percentage, bands);
  return { percentage, grade: band?.label ?? null, gpa: band?.gpa ?? null };
}

/** One credit-weighted GPA input. */
export interface GpaEntry {
  readonly gpa: number | null;
  readonly credits: number;
}

/**
 * Grade-point average over a set of entries. GPA points are credit-weighted when credits are
 * present; otherwise a simple average of the graded entries. Entries without a GPA are ignored;
 * an empty set yields 0. Two-decimal.
 */
export function computeGpa(entries: readonly GpaEntry[]): number {
  const graded = entries.filter((entry): entry is GpaEntry & { gpa: number } => entry.gpa !== null);
  if (graded.length === 0) {
    return 0;
  }
  const totalCredits = graded.reduce((sum, entry) => sum + Math.max(0, entry.credits), 0);
  if (totalCredits > 0) {
    const weighted = graded.reduce((sum, entry) => sum + entry.gpa * Math.max(0, entry.credits), 0);
    return round(weighted / totalCredits);
  }
  const sum = graded.reduce((total, entry) => total + entry.gpa, 0);
  return round(sum / graded.length);
}
