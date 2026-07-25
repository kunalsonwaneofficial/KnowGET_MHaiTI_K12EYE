import {
  type AttritionRiskBand,
  EMPLOYMENT_STATUSES,
  type EmploymentStatus,
  isActiveEmployment,
  worseRisk,
} from "./workforce-value";
import type {
  EmployeeView,
  ReviewView,
  WorkforceIndicators,
  WorkforceMemberView,
  WorkforceSummary,
} from "./workforce-view";

/** Extract [year, month, day] from an ISO date string ("2026-11-01" or "2026-11-01T…"). */
const parseYmd = (iso: string): [number, number, number] => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return [y ?? 0, m ?? 0, d ?? 0];
};

/** Whole months of tenure between a hire date and an as-of date (never negative). Pure. */
export function computeTenureMonths(hireDate: string, asOf: string): number {
  const [hy, hm, hd] = parseYmd(hireDate);
  const [ay, am, ad] = parseYmd(asOf);
  let months = (ay - hy) * 12 + (am - hm);
  if (ad < hd) {
    months -= 1;
  }
  return Math.max(0, months);
}

const emptyRiskDistribution = (): Record<AttritionRiskBand, number> => ({
  low: 0,
  moderate: 0,
  elevated: 0,
  high: 0,
});

/**
 * The pure workforce-intelligence engine — derives descriptive indicators for one employee from
 * tenure, leave utilization and finalized review standing, and a transparent, worst-of
 * attrition-risk band. **Descriptive and explainable only, never a prediction** (predictive
 * modelling is a P2-D12 non-goal deferred to the intelligence core, P2-D28): the band is the worst
 * of a few named factors — short tenure, weak review standing, very high leave utilization, and a
 * fragile employment status — not an opaque score.
 */
export function computeWorkforceIndicators(
  scope: {
    readonly employee: EmployeeView;
    readonly leaveUtilizationRate?: number;
    readonly reviews?: readonly ReviewView[];
  },
  asOf: string,
): WorkforceIndicators {
  const round = (value: number): number => Math.round(value * 100) / 100;
  const clampPct = (value: number): number => round(Math.min(100, Math.max(0, value)));

  const tenureMonths = computeTenureMonths(scope.employee.hireDate, asOf);
  const leaveUtilizationRate = clampPct(scope.leaveUtilizationRate ?? 0);

  const finalized = (scope.reviews ?? []).filter((r) => r.status === "finalized");
  const rated = finalized
    .map((r) => r.overallRating)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const averageReviewRating =
    rated.length === 0 ? null : round(rated.reduce((sum, v) => sum + v, 0) / rated.length);

  // Transparent, worst-of risk factors — each names its reason; nothing is predicted.
  let band: AttritionRiskBand = "low";
  band = worseRisk(band, tenureMonths < 6 ? "elevated" : tenureMonths < 12 ? "moderate" : "low");
  if (averageReviewRating !== null) {
    band = worseRisk(
      band,
      averageReviewRating <= 2 ? "high" : averageReviewRating <= 3 ? "elevated" : "low",
    );
  }
  band = worseRisk(band, leaveUtilizationRate > 90 ? "elevated" : "low");
  band = worseRisk(
    band,
    scope.employee.status === "notice_period"
      ? "high"
      : scope.employee.status === "suspended"
        ? "elevated"
        : "low",
  );

  return {
    tenureMonths,
    employmentStatus: scope.employee.status,
    leaveUtilizationRate,
    reviewsFinalized: finalized.length,
    averageReviewRating,
    attritionRiskBand: band,
  };
}

/**
 * The pure workforce-rollup engine — summarizes a set of employees into a descriptive workforce
 * picture: headcount and active headcount, status distribution, average tenure, and the
 * attrition-risk distribution with the count needing attention (elevated or high). Pure and
 * deterministic; leadership-facing and descriptive only.
 */
export function summarizeWorkforce(
  members: readonly WorkforceMemberView[],
  asOf: string,
): WorkforceSummary {
  const round = (value: number): number => Math.round(value * 100) / 100;

  const statusDistribution = Object.fromEntries(EMPLOYMENT_STATUSES.map((s) => [s, 0])) as Record<
    EmploymentStatus,
    number
  >;
  const riskDistribution = emptyRiskDistribution();

  let activeHeadcount = 0;
  let atRiskCount = 0;
  let tenureSum = 0;
  for (const member of members) {
    statusDistribution[member.status] += 1;
    riskDistribution[member.attritionRiskBand] += 1;
    if (isActiveEmployment(member.status)) {
      activeHeadcount += 1;
    }
    if (member.attritionRiskBand === "elevated" || member.attritionRiskBand === "high") {
      atRiskCount += 1;
    }
    tenureSum += computeTenureMonths(member.hireDate, asOf);
  }

  return {
    headcount: members.length,
    activeHeadcount,
    statusDistribution,
    averageTenureMonths: members.length === 0 ? 0 : round(tenureSum / members.length),
    riskDistribution,
    atRiskCount,
  };
}
