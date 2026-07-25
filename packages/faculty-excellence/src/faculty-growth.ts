import { bandForRating, type GrowthBand } from "./faculty-value";
import type {
  FacultyIndicators,
  FacultyMemberView,
  FacultySummary,
  GoalView,
  ObservationView,
} from "./faculty-view";

const emptyGrowthDistribution = (): Record<GrowthBand, number> => ({
  emerging: 0,
  developing: 0,
  proficient: 0,
  distinguished: 0,
});

/**
 * The pure faculty-growth engine — derives descriptive indicators for one staff member from their
 * **acknowledged** observations (the mean 1–4 practice rating and the competencies observed), their
 * **development-goal progress** (achieved of those in play) and their **PD compliance** (from the
 * ledger). The growth band is the transparent mapping of the observed-practice rating onto the
 * ascending scale — **descriptive and explainable, never a prediction** (predictive modelling is a
 * P2-D13 non-goal deferred to the intelligence core, P2-D28). With no acknowledged observation the
 * band is the base `emerging` (insufficient evidence), which the profile records honestly.
 */
export function computeFacultyGrowth(scope: {
  readonly observations?: readonly ObservationView[];
  readonly goals?: readonly GoalView[];
  readonly developmentComplianceRate?: number;
}): FacultyIndicators {
  const round = (value: number): number => Math.round(value * 100) / 100;
  const clampPct = (value: number): number => round(Math.min(100, Math.max(0, value)));

  const acknowledged = (scope.observations ?? []).filter((o) => o.status === "acknowledged");
  const rated = acknowledged
    .map((o) => o.overallRating)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const averageObservationRating =
    rated.length === 0 ? null : round(rated.reduce((sum, v) => sum + v, 0) / rated.length);
  const competenciesObserved = new Set(acknowledged.flatMap((o) => o.competencyKeys)).size;

  // Goals "in play" are those past draft; progress is achieved of those.
  const inPlay = (scope.goals ?? []).filter((g) => g.status !== "draft");
  const goalsAchieved = inPlay.filter((g) => g.status === "achieved").length;
  const goalProgressPct = inPlay.length === 0 ? 0 : round((100 * goalsAchieved) / inPlay.length);

  const growthBand: GrowthBand =
    averageObservationRating === null ? "emerging" : bandForRating(averageObservationRating);

  return {
    observationsConsidered: acknowledged.length,
    averageObservationRating,
    competenciesObserved,
    goalsTotal: inPlay.length,
    goalsAchieved,
    goalProgressPct,
    developmentComplianceRate: clampPct(scope.developmentComplianceRate ?? 0),
    growthBand,
  };
}

/**
 * The pure faculty-rollup engine — summarizes a set of staff members into a descriptive growth
 * picture: headcount, growth-band distribution, and the counts distinguished and needing support
 * (emerging or developing). Pure and deterministic; leadership-facing and descriptive only.
 */
export function summarizeFaculty(members: readonly FacultyMemberView[]): FacultySummary {
  const growthDistribution = emptyGrowthDistribution();
  let distinguishedCount = 0;
  let needsSupportCount = 0;
  for (const member of members) {
    growthDistribution[member.growthBand] += 1;
    if (member.growthBand === "distinguished") {
      distinguishedCount += 1;
    }
    if (member.growthBand === "emerging" || member.growthBand === "developing") {
      needsSupportCount += 1;
    }
  }
  return {
    headcount: members.length,
    growthDistribution,
    distinguishedCount,
    needsSupportCount,
  };
}
