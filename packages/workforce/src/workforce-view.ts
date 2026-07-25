import type {
  AttritionRiskBand,
  EmploymentStatus,
  LeaveStatus,
  LeaveType,
} from "./workforce-value";

/**
 * The narrow views the pure engines consume. The aggregates structurally satisfy them, so the
 * engines depend on no aggregate — the same pure-engine-over-views pattern used across P2-D07…D11.
 */

/** The minimal view of a leave entitlement the ledger engine needs. */
export interface LeaveEntitlementView {
  readonly leaveType: LeaveType;
  readonly entitledDays: number;
}

/** The minimal view of a leave request the ledger engine needs. */
export interface LeaveRequestView {
  readonly leaveType: LeaveType;
  readonly days: number;
  readonly status: LeaveStatus;
}

/** One leave type's ledger line — entitled, taken (approved), pending and remaining days. */
export interface LeaveLedgerLine {
  readonly leaveType: LeaveType;
  readonly entitled: number;
  readonly taken: number;
  readonly pending: number;
  readonly remaining: number;
}

/** A staff member's leave ledger across all types, with totals and a utilization rate (0–100). */
export interface LeaveLedger {
  readonly lines: readonly LeaveLedgerLine[];
  readonly totalEntitled: number;
  readonly totalTaken: number;
  readonly totalPending: number;
  readonly totalRemaining: number;
  readonly utilizationRate: number;
}

/** The minimal view of an employee the workforce-intelligence engine needs. */
export interface EmployeeView {
  readonly status: EmploymentStatus;
  readonly hireDate: string;
}

/** The minimal view of a performance review the engine needs (state + overall rating 1–5 or null). */
export interface ReviewView {
  readonly status: ReviewStatusLike;
  readonly overallRating: number | null;
}

/** A finalized review is the one that counts toward standing. */
export type ReviewStatusLike = "draft" | "submitted" | "acknowledged" | "finalized";

/**
 * AI-ready, read-only descriptive workforce indicators for one employee — tenure, leave
 * utilization, review standing and a transparent attrition-risk band. Descriptive only; predictive
 * modelling is a P2-D12 non-goal (deferred to the intelligence core, P2-D28).
 */
export interface WorkforceIndicators {
  readonly tenureMonths: number;
  readonly employmentStatus: EmploymentStatus;
  readonly leaveUtilizationRate: number;
  readonly reviewsFinalized: number;
  readonly averageReviewRating: number | null;
  readonly attritionRiskBand: AttritionRiskBand;
}

/** The minimal view of an employee the workforce rollup needs. */
export interface WorkforceMemberView {
  readonly status: EmploymentStatus;
  readonly hireDate: string;
  readonly attritionRiskBand: AttritionRiskBand;
}

/**
 * A leadership-facing descriptive rollup of a workforce scope — headcount, status distribution,
 * average tenure and attrition-risk distribution. Descriptive only. Averages are two-decimal.
 */
export interface WorkforceSummary {
  readonly headcount: number;
  readonly activeHeadcount: number;
  readonly statusDistribution: Readonly<Record<EmploymentStatus, number>>;
  readonly averageTenureMonths: number;
  readonly riskDistribution: Readonly<Record<AttritionRiskBand, number>>;
  readonly atRiskCount: number;
}
