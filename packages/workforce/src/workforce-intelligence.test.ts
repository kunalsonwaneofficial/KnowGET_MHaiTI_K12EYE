import { describe, expect, it } from "vitest";
import {
  computeTenureMonths,
  computeWorkforceIndicators,
  summarizeWorkforce,
} from "./workforce-intelligence";
import type { ReviewView, WorkforceMemberView } from "./workforce-view";

const ASOF = "2026-11-01";

describe("computeTenureMonths", () => {
  it("computes whole months, adjusting for the day of month", () => {
    expect(computeTenureMonths("2025-01-15", ASOF)).toBe(21); // 22 months, minus 1 (day 1 < 15)
    expect(computeTenureMonths("2026-11-01", ASOF)).toBe(0);
    expect(computeTenureMonths("2030-01-01", ASOF)).toBe(0); // never negative
  });
});

describe("computeWorkforceIndicators", () => {
  it("is low risk for a tenured, well-reviewed, active employee", () => {
    const reviews: ReviewView[] = [{ status: "finalized", overallRating: 4 }];
    const ind = computeWorkforceIndicators(
      { employee: { status: "active", hireDate: "2020-01-01" }, leaveUtilizationRate: 30, reviews },
      ASOF,
    );
    expect(ind.tenureMonths).toBeGreaterThan(12);
    expect(ind.averageReviewRating).toBe(4);
    expect(ind.reviewsFinalized).toBe(1);
    expect(ind.attritionRiskBand).toBe("low");
  });

  it("flags short tenure as elevated risk (worst-of factors)", () => {
    const ind = computeWorkforceIndicators(
      { employee: { status: "onboarding", hireDate: "2026-09-01" } },
      ASOF,
    );
    expect(ind.tenureMonths).toBe(2);
    expect(ind.averageReviewRating).toBeNull();
    expect(ind.attritionRiskBand).toBe("elevated");
  });

  it("escalates to high risk on a weak finalized review", () => {
    const reviews: ReviewView[] = [
      { status: "finalized", overallRating: 2 },
      { status: "draft", overallRating: 5 }, // not finalized → ignored
    ];
    const ind = computeWorkforceIndicators(
      { employee: { status: "active", hireDate: "2018-01-01" }, reviews },
      ASOF,
    );
    expect(ind.averageReviewRating).toBe(2);
    expect(ind.attritionRiskBand).toBe("high");
  });
});

describe("summarizeWorkforce", () => {
  it("rolls up headcount, status and risk distribution", () => {
    const members: WorkforceMemberView[] = [
      { status: "active", hireDate: "2020-01-01", attritionRiskBand: "low" },
      { status: "active", hireDate: "2026-09-01", attritionRiskBand: "high" },
      { status: "alumni", hireDate: "2015-01-01", attritionRiskBand: "moderate" },
    ];
    const summary = summarizeWorkforce(members, ASOF);
    expect(summary.headcount).toBe(3);
    expect(summary.activeHeadcount).toBe(2); // alumni is terminal
    expect(summary.statusDistribution.active).toBe(2);
    expect(summary.statusDistribution.alumni).toBe(1);
    expect(summary.riskDistribution.high).toBe(1);
    expect(summary.riskDistribution.low).toBe(1);
    expect(summary.atRiskCount).toBe(1); // only the high one
  });
});
