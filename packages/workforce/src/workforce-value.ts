/**
 * The employment relationship type. Compensation amounts are **not** modelled here — they belong
 * to the Financial platform (P2-D14); a contract carries only the pay grade/band label.
 */
export const EMPLOYMENT_TYPES = [
  "full_time",
  "part_time",
  "contract",
  "temporary",
  "visiting",
  "intern",
] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

/**
 * The employee's lifecycle stage. `onboarding` → `active`, with `on_leave` / `suspended` /
 * `notice_period` as reversible states, then the terminal separations `resigned` / `terminated` /
 * `retired` → `alumni`. Mirrors the student lifecycle shape (P2-D03).
 */
export const EMPLOYMENT_STATUSES = [
  "onboarding",
  "active",
  "on_leave",
  "suspended",
  "notice_period",
  "resigned",
  "terminated",
  "retired",
  "alumni",
] as const;

export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

/** The separation / terminal employment statuses — an employee here no longer occupies a live post. */
export const TERMINAL_EMPLOYMENT_STATUSES: readonly EmploymentStatus[] = [
  "resigned",
  "terminated",
  "retired",
  "alumni",
];

/** Whether an employment status is a live (non-terminal) one — used for the one-active-employment rule. */
export const isActiveEmployment = (status: EmploymentStatus): boolean =>
  !TERMINAL_EMPLOYMENT_STATUSES.includes(status);

/** Narrow an arbitrary string to an {@link EmploymentStatus}. */
export const isEmploymentStatus = (value: string): value is EmploymentStatus =>
  (EMPLOYMENT_STATUSES as readonly string[]).includes(value);

/** The kind of staff leave. Balances are tracked per type by the pure leave-ledger engine. */
export const LEAVE_TYPES = [
  "annual",
  "sick",
  "casual",
  "maternity",
  "paternity",
  "bereavement",
  "sabbatical",
  "unpaid",
] as const;

export type LeaveType = (typeof LEAVE_TYPES)[number];

/** Lifecycle of a leave request. Only `approved` leave draws down the balance. */
export const LEAVE_STATUSES = ["requested", "approved", "rejected", "cancelled"] as const;

export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

/** Lifecycle of a version-controlled employment contract. */
export const CONTRACT_STATUSES = ["draft", "active", "expired", "terminated"] as const;

export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

/** Lifecycle of an HR performance review cycle. */
export const REVIEW_STATUSES = ["draft", "submitted", "acknowledged", "finalized"] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/**
 * A descriptive attrition-risk band for an employee — never a prediction. It is the worst of a few
 * transparent factors (tenure, review standing, leave utilization); predictive modelling is a
 * P2-D12 non-goal deferred to the intelligence core (P2-D28).
 */
export const ATTRITION_RISK_BANDS = ["low", "moderate", "elevated", "high"] as const;

export type AttritionRiskBand = (typeof ATTRITION_RISK_BANDS)[number];

/** The ordinal severity of a risk band (0 = low … 3 = high). */
export const riskRank = (band: AttritionRiskBand): number => ATTRITION_RISK_BANDS.indexOf(band);

/** The worse (higher-severity) of two risk bands. */
export const worseRisk = (a: AttritionRiskBand, b: AttritionRiskBand): AttritionRiskBand =>
  riskRank(a) >= riskRank(b) ? a : b;

/** Narrow an arbitrary string to a {@link LeaveType}. */
export const isLeaveType = (value: string): value is LeaveType =>
  (LEAVE_TYPES as readonly string[]).includes(value);
