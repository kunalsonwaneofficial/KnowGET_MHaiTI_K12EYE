import type {
  ActivityStatus,
  GoalStatus,
  GrowthBand,
  ObservationStatus,
  PdCategory,
} from "./faculty-value";

/**
 * The narrow views the pure engines consume. The aggregates structurally satisfy them, so the
 * engines depend on no aggregate — the same pure-engine-over-views pattern used across P2-D07…D12.
 */

/** The minimal view of a PD requirement the ledger engine needs. */
export interface DevelopmentRequirementView {
  readonly category: PdCategory;
  readonly requiredHours: number;
}

/** The minimal view of a PD activity the ledger engine needs. */
export interface DevelopmentActivityView {
  readonly category: PdCategory;
  readonly hours: number;
  readonly status: ActivityStatus;
}

/** One category's ledger line — required, completed (only `completed` activities) and remaining hours. */
export interface DevelopmentLedgerLine {
  readonly category: PdCategory;
  readonly required: number;
  readonly completed: number;
  readonly remaining: number;
  readonly compliancePct: number;
}

/** A staff member's professional-development ledger across all categories, with totals and a rate. */
export interface DevelopmentLedger {
  readonly lines: readonly DevelopmentLedgerLine[];
  readonly totalRequired: number;
  readonly totalCompleted: number;
  readonly totalRemaining: number;
  readonly complianceRate: number;
}

/** The minimal view of an observation the faculty-growth engine needs. */
export interface ObservationView {
  readonly status: ObservationStatus;
  readonly overallRating: number | null;
  readonly competencyKeys: readonly string[];
}

/** The minimal view of a development goal the faculty-growth engine needs. */
export interface GoalView {
  readonly status: GoalStatus;
}

/**
 * AI-ready, read-only descriptive faculty-growth indicators for one staff member — observed-practice
 * standing, development-goal progress, PD compliance and a transparent growth band. Descriptive only;
 * predictive modelling is a P2-D13 non-goal (deferred to the intelligence core, P2-D28).
 */
export interface FacultyIndicators {
  readonly observationsConsidered: number;
  readonly averageObservationRating: number | null;
  readonly competenciesObserved: number;
  readonly goalsTotal: number;
  readonly goalsAchieved: number;
  readonly goalProgressPct: number;
  readonly developmentComplianceRate: number;
  readonly growthBand: GrowthBand;
}

/** The minimal view of a staff member the faculty rollup needs. */
export interface FacultyMemberView {
  readonly growthBand: GrowthBand;
}

/**
 * A leadership-facing descriptive rollup of a faculty scope — headcount, growth-band distribution,
 * and the counts distinguished and needing support (emerging or developing). Descriptive only.
 */
export interface FacultySummary {
  readonly headcount: number;
  readonly growthDistribution: Readonly<Record<GrowthBand, number>>;
  readonly distinguishedCount: number;
  readonly needsSupportCount: number;
}
