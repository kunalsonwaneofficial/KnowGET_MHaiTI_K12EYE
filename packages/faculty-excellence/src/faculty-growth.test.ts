import { describe, expect, it } from "vitest";
import { computeFacultyGrowth, summarizeFaculty } from "./faculty-growth";
import type { FacultyMemberView, GoalView, ObservationView } from "./faculty-view";

describe("computeFacultyGrowth", () => {
  it("is emerging with no acknowledged observations (insufficient evidence)", () => {
    const ind = computeFacultyGrowth({});
    expect(ind.observationsConsidered).toBe(0);
    expect(ind.averageObservationRating).toBeNull();
    expect(ind.growthBand).toBe("emerging");
    expect(ind.goalProgressPct).toBe(0);
    expect(ind.developmentComplianceRate).toBe(0);
  });

  it("synthesizes standing from acknowledged observations, goals and PD compliance", () => {
    const observations: ObservationView[] = [
      { status: "acknowledged", overallRating: 3, competencyKeys: ["ped-1", "ped-2"] },
      { status: "acknowledged", overallRating: 4, competencyKeys: ["ped-2", "mgmt-1"] },
      { status: "shared", overallRating: 1, competencyKeys: ["x"] }, // not acknowledged → ignored
    ];
    const goals: GoalView[] = [
      { status: "achieved" },
      { status: "active" },
      { status: "draft" }, // not in play → ignored
    ];
    const ind = computeFacultyGrowth({ observations, goals, developmentComplianceRate: 75 });

    expect(ind.observationsConsidered).toBe(2);
    expect(ind.averageObservationRating).toBe(3.5); // (3 + 4) / 2
    expect(ind.competenciesObserved).toBe(3); // ped-1, ped-2, mgmt-1
    expect(ind.growthBand).toBe("distinguished"); // 3.5 → distinguished
    expect(ind.goalsTotal).toBe(2); // achieved + active
    expect(ind.goalsAchieved).toBe(1);
    expect(ind.goalProgressPct).toBe(50);
    expect(ind.developmentComplianceRate).toBe(75);
  });

  it("bands a middling practice rating as developing", () => {
    const observations: ObservationView[] = [
      { status: "acknowledged", overallRating: 2, competencyKeys: ["a"] },
      { status: "acknowledged", overallRating: 2.4, competencyKeys: ["a"] },
    ];
    const ind = computeFacultyGrowth({ observations });
    expect(ind.averageObservationRating).toBe(2.2);
    expect(ind.growthBand).toBe("developing"); // 2.2 → developing
  });
});

describe("summarizeFaculty", () => {
  it("rolls up growth-band distribution and support counts", () => {
    const members: FacultyMemberView[] = [
      { growthBand: "distinguished" },
      { growthBand: "proficient" },
      { growthBand: "developing" },
      { growthBand: "emerging" },
    ];
    const summary = summarizeFaculty(members);
    expect(summary.headcount).toBe(4);
    expect(summary.growthDistribution.distinguished).toBe(1);
    expect(summary.growthDistribution.emerging).toBe(1);
    expect(summary.distinguishedCount).toBe(1);
    expect(summary.needsSupportCount).toBe(2); // emerging + developing
  });
});
