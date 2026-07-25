import type { ISODateString, Uuid } from "@knowget/types";

/**
 * The learning dimensions the platform synthesizes intelligence across. Each maps to the
 * descriptive indicators an upstream academic domain already exposes — `academic` (assessment
 * P2-D10), `attendance` (presence P2-D08), `engagement` (teaching-learning P2-D09), `wellbeing`
 * (learner wellbeing P2-D05) and `progression` (student lifecycle P2-D03) — so this domain
 * **synthesizes** rather than recomputes them.
 */
export const INSIGHT_DIMENSIONS = [
  "academic",
  "attendance",
  "engagement",
  "wellbeing",
  "progression",
] as const;

export type InsightDimension = (typeof INSIGHT_DIMENSIONS)[number];

/**
 * A learner's descriptive risk band on the 0–100 learning-health scale (higher is healthier).
 * Outcome-oriented and explainable — never a prediction: `on_track` ≥ 75, `watch` ≥ 50,
 * `at_risk` ≥ 25, `critical` below 25.
 */
export const RISK_BANDS = ["on_track", "watch", "at_risk", "critical"] as const;

export type RiskBand = (typeof RISK_BANDS)[number];

/** The trend a signal reports for its dimension. */
export const SIGNAL_TRENDS = ["improving", "stable", "declining"] as const;

export type SignalTrend = (typeof SIGNAL_TRENDS)[number];

/**
 * The upstream domain a learning signal was distilled from. `manual` is a staff-entered
 * observation. The source plus the evidence reference form the signal's evidence chain.
 */
export const SIGNAL_SOURCES = [
  "student_lifecycle",
  "wellbeing",
  "attendance_presence",
  "teaching_learning",
  "assessment_evaluation",
  "manual",
] as const;

export type SignalSource = (typeof SIGNAL_SOURCES)[number];

/**
 * A reference to the upstream record that substantiates a signal, insight, warning or
 * recommendation — the evidence chain the human-centred AI constraint requires. `ref` is the
 * source aggregate's id; `kind` labels what it is (e.g. `evaluation`, `attendance_record`).
 */
export interface EvidenceRef {
  readonly source: SignalSource;
  readonly kind: string;
  readonly ref: Uuid | null;
  readonly detail: string | null;
}

/** The lower-bound of each risk band on the 0–100 learning-health scale (inclusive). */
const BAND_FLOORS: ReadonlyArray<readonly [RiskBand, number]> = [
  ["on_track", 75],
  ["watch", 50],
  ["at_risk", 25],
  ["critical", 0],
];

/** The descriptive risk band a 0–100 learning-health score earns (higher is healthier). */
export const bandFor = (score: number): RiskBand => {
  const clamped = Math.min(100, Math.max(0, score));
  for (const [band, floor] of BAND_FLOORS) {
    if (clamped >= floor) {
      return band;
    }
  }
  return "critical";
};

/** Whether a band is at_risk or critical (the bands that warrant attention). */
export const needsAttention = (band: RiskBand): boolean =>
  band === "at_risk" || band === "critical";

/** Narrow an arbitrary string to an {@link InsightDimension}. */
export const isInsightDimension = (value: string): value is InsightDimension =>
  (INSIGHT_DIMENSIONS as readonly string[]).includes(value);

/** Narrow an arbitrary string to a {@link RiskBand}. */
export const isRiskBand = (value: string): value is RiskBand =>
  (RISK_BANDS as readonly string[]).includes(value);

/** One dimension's synthesized reading — its 0–100 health score, band and how many signals fed it. */
export interface DimensionScore {
  readonly dimension: InsightDimension;
  readonly score: number;
  readonly band: RiskBand;
  readonly signalCount: number;
}

/** An entry in an insight's, warning's or recommendation's append-only status history. */
export interface InsightEvent {
  readonly action: string;
  readonly actor: Uuid | null;
  readonly at: ISODateString;
  readonly note: string | null;
}
