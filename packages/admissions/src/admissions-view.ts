/**
 * The narrow views the two pure engines consume. The aggregates structurally satisfy them, so the engines
 * depend on no aggregate — the same pure-engine-over-views pattern used across P2-D07…D22.
 */

// --- Funnel engine ---------------------------------------------------------------

/** The counts the funnel engine reads — the size of each stage of the admissions funnel for a cycle. */
export interface FunnelCountsView {
  readonly leadCount: number;
  readonly applicationCount: number;
  readonly offerCount: number;
  readonly enrollmentCount: number;
}

/**
 * The admissions funnel — the stage counts and the conversion rates between them (lead → application →
 * offer → enrollment) plus the overall lead → enrollment rate. Derived by the pure engine — never stored as
 * truth.
 */
export interface AdmissionFunnel {
  readonly leadCount: number;
  readonly applicationCount: number;
  readonly offerCount: number;
  readonly enrollmentCount: number;
  readonly leadToApplicationPercent: number;
  readonly applicationToOfferPercent: number;
  readonly offerToEnrollmentPercent: number;
  readonly overallConversionPercent: number;
}

/** The minimal view of an application the stage tally reads — its status. */
export interface ApplicationStageView {
  readonly status: string;
}

/** The count of applications at one status. */
export interface StageCount {
  readonly status: string;
  readonly count: number;
}

/** The application-stage distribution over a set of applications — the total and the per-status counts. */
export interface ApplicationStageSummary {
  readonly total: number;
  readonly stages: readonly StageCount[];
}

// --- Intake engine ---------------------------------------------------------------

/** The minimal view of a grade's intake the engine reads — its seat capacity and confirmed enrollments. */
export interface GradeIntakeView {
  readonly capacity: number;
  readonly confirmedCount: number;
}

/**
 * A grade's intake picture — seats confirmed against capacity, seats remaining, whether it is
 * over-subscribed, and a fill percent. Derived by the pure engine — never stored as truth.
 */
export interface IntakeCapacity {
  readonly capacity: number;
  readonly confirmedCount: number;
  readonly remaining: number;
  readonly overSubscribed: boolean;
  readonly fillPercent: number;
}

/** The cycle-wide intake picture — the grade count, total capacity, total confirmed and overall fill. */
export interface IntakeSummary {
  readonly gradeCount: number;
  readonly totalCapacity: number;
  readonly totalConfirmed: number;
  readonly fillPercent: number;
}

/** A grade's intake picture labeled with the grade it belongs to — the per-grade read the refresh spine exposes. */
export interface GradeIntakeCapacity extends IntakeCapacity {
  readonly grade: string;
}
