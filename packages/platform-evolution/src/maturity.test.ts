import { describe, expect, it } from "vitest";
import {
  CAPABILITY_AREAS,
  CAPABILITY_AREA_COUNT,
  LEVEL_FLOORS,
  MATURITY_LEVELS,
  MAX_AREA_WEIGHT,
  MAX_MATURITY_SCORE,
  MIN_AREA_COVERAGE,
  MIN_AREA_WEIGHT,
  MIN_MATURITY_SCORE,
  levelRank,
} from "./evolution-value";
import type { AreaReading, AreaWeight, ResolvedWeight } from "./evolution-view";
import * as maturity from "./maturity";
import { assessMaturity, inspectWeighting, levelForScore } from "./maturity";

const EVEN_WEIGHT = 1 / CAPABILITY_AREA_COUNT;

const declaredEvenly: AreaWeight[] = CAPABILITY_AREAS.map((area) => ({
  area,
  weight: EVEN_WEIGHT,
}));

const resolvedEvenly: ResolvedWeight[] = CAPABILITY_AREAS.map((area) => ({
  area,
  weight: EVEN_WEIGHT,
}));

const reading = (area: string, score: number, evidenceCount = 1): AreaReading => ({
  area,
  score,
  evidenceCount,
});

const readAll = (score: number, reportingCount: number = CAPABILITY_AREA_COUNT): AreaReading[] =>
  CAPABILITY_AREAS.map((area, position) => reading(area, score, position < reportingCount ? 1 : 0));

const codes = (issues: readonly { code: string }[]): string[] => issues.map((issue) => issue.code);

describe("inspectWeighting", () => {
  it("accepts an even weighting across all ten capability areas", () => {
    const verdict = inspectWeighting(declaredEvenly);
    expect(verdict.usable).toBe(true);
    expect(verdict.weights).toHaveLength(CAPABILITY_AREA_COUNT);
    expect(verdict.total).toBe(1);
    expect(verdict.issues).toEqual([]);
  });

  it("absorbs floating-point drift in the sum without absorbing a real shortfall", () => {
    const drifting = declaredEvenly.reduce((sum, entry) => sum + entry.weight, 0);
    expect(drifting).not.toBe(1);
    expect(inspectWeighting(declaredEvenly).usable).toBe(true);
  });

  it("reports an empty weighting as empty rather than as one that fails to sum", () => {
    const verdict = inspectWeighting([]);
    expect(codes(verdict.issues)).toEqual(["no_weights"]);
    expect(verdict.total).toBe(0);
  });

  it("refuses a weighting that does not reach one", () => {
    const short = declaredEvenly.slice(0, 5);
    const verdict = inspectWeighting(short);
    expect(verdict.usable).toBe(false);
    expect(codes(verdict.issues)).toEqual(["weights_do_not_sum"]);
    expect(verdict.total).toBe(0.5);
  });

  it("reports an unrecognised area at its own entry", () => {
    const verdict = inspectWeighting([{ area: "morale", weight: 1 }]);
    expect(verdict.issues).toContainEqual({ code: "unknown_area", entryIndex: 0 });
    expect(verdict.weights).toEqual([]);
  });

  it("reports an area declared twice at the repeat, keeping the first", () => {
    const verdict = inspectWeighting([
      { area: "academic_practice", weight: 0.5 },
      { area: "academic_practice", weight: 0.5 },
      { area: "learner_support", weight: 0.5 },
    ]);
    expect(verdict.issues).toContainEqual({ code: "duplicate_area", entryIndex: 1 });
    expect(verdict.weights).toEqual([
      { area: "academic_practice", weight: 0.5 },
      { area: "learner_support", weight: 0.5 },
    ]);
  });

  it("reports a weight arithmetic cannot be trusted with", () => {
    const verdict = inspectWeighting([{ area: "academic_practice", weight: Number.NaN }]);
    expect(verdict.issues).toContainEqual({ code: "invalid_weight", entryIndex: 0 });
  });

  it("refuses an area present in name only", () => {
    const verdict = inspectWeighting([{ area: "academic_practice", weight: MIN_AREA_WEIGHT / 2 }]);
    expect(verdict.issues).toContainEqual({ code: "weight_too_small", entryIndex: 0 });
  });

  it("refuses a single area that would be the score on its own", () => {
    const verdict = inspectWeighting([
      { area: "academic_practice", weight: MAX_AREA_WEIGHT + 0.1 },
      { area: "learner_support", weight: 0.4 },
    ]);
    expect(verdict.issues).toContainEqual({ code: "weight_too_large", entryIndex: 0 });
  });

  it("accepts an area sitting exactly on either bound", () => {
    const verdict = inspectWeighting([
      { area: "academic_practice", weight: MAX_AREA_WEIGHT },
      { area: "learner_support", weight: MAX_AREA_WEIGHT - MIN_AREA_WEIGHT },
      { area: "staff_capability", weight: MIN_AREA_WEIGHT },
    ]);
    expect(verdict.usable).toBe(true);
    expect(verdict.total).toBe(1);
  });

  it("rounds declared weights rather than carrying an assessor's spurious precision", () => {
    const verdict = inspectWeighting([
      { area: "academic_practice", weight: 0.500049 },
      { area: "learner_support", weight: 0.499951 },
    ]);
    expect(verdict.weights).toEqual([
      { area: "academic_practice", weight: 0.5 },
      { area: "learner_support", weight: 0.5 },
    ]);
  });

  it("returns the running total even when the weighting is unusable", () => {
    const verdict = inspectWeighting([
      { area: "morale", weight: 0.6 },
      { area: "academic_practice", weight: 0.4 },
    ]);
    expect(verdict.usable).toBe(false);
    expect(verdict.total).toBe(0.4);
  });
});

describe("levelForScore", () => {
  it("returns each level at its own floor", () => {
    for (const level of MATURITY_LEVELS) {
      expect(levelForScore(LEVEL_FLOORS[level])).toBe(level);
    }
  });

  it("reads a boundary inclusively, so a whole number keeps the word its author meant", () => {
    expect(levelForScore(3)).toBe("defined");
    expect(levelForScore(2.99)).toBe("developing");
  });

  it("clamps a score above the scale rather than falling off the top", () => {
    expect(levelForScore(MAX_MATURITY_SCORE + 4)).toBe("optimizing");
  });

  it("clamps a score below the scale onto the bottom level", () => {
    expect(levelForScore(MIN_MATURITY_SCORE - 4)).toBe("initial");
  });

  it("floors a score nobody can compute rather than crediting it, infinities included", () => {
    expect(levelForScore(Number.NaN)).toBe("initial");
    expect(levelForScore(Number.POSITIVE_INFINITY)).toBe("initial");
    expect(levelForScore(Number.NEGATIVE_INFINITY)).toBe("initial");
  });

  it("separates off-scale from uncomputable: a finite overshoot still tops out at optimizing", () => {
    expect(levelForScore(Number.MAX_SAFE_INTEGER)).toBe("optimizing");
    expect(levelForScore(Number.POSITIVE_INFINITY)).toBe("initial");
  });

  it("never falls as the score rises", () => {
    let lowest = 0;
    for (let score = MIN_MATURITY_SCORE; score <= MAX_MATURITY_SCORE; score += 0.05) {
      const rank = levelRank(levelForScore(score));
      expect(rank).toBeGreaterThanOrEqual(lowest);
      lowest = rank;
    }
  });
});

describe("assessMaturity", () => {
  it("assesses an institution that reported everywhere", () => {
    const verdict = assessMaturity(readAll(3), resolvedEvenly);
    expect(verdict.publishable).toBe(true);
    expect(verdict.index).toBe(3);
    expect(verdict.level).toBe("defined");
    expect(verdict.coverage).toBe(1);
    expect(verdict.areasReported).toBe(CAPABILITY_AREA_COUNT);
    expect(verdict.issues).toEqual([]);
  });

  it("weights the areas as the institution declared them", () => {
    const weights: ResolvedWeight[] = [
      { area: "governance_and_leadership", weight: 0.5 },
      { area: "academic_practice", weight: 0.3 },
      { area: "learner_support", weight: 0.2 },
    ];
    const verdict = assessMaturity(
      [
        reading("governance_and_leadership", 5),
        reading("academic_practice", 3),
        reading("learner_support", 1),
      ],
      weights,
    );
    expect(verdict.index).toBe(3.6);
    expect(verdict.level).toBe("defined");
  });

  it("measures coverage against all ten areas, never against however many were declared", () => {
    const weights: ResolvedWeight[] = [
      { area: "governance_and_leadership", weight: 0.4 },
      { area: "academic_practice", weight: 0.3 },
      { area: "learner_support", weight: 0.3 },
    ];
    const verdict = assessMaturity(
      [
        reading("governance_and_leadership", 4),
        reading("academic_practice", 4),
        reading("learner_support", 4),
      ],
      weights,
    );
    expect(verdict.areasReported).toBe(3);
    expect(verdict.coverage).toBe(0.3);
    expect(verdict.publishable).toBe(false);
    expect(codes(verdict.issues)).toContain("below_coverage_floor");
  });

  it("publishes an assessment sitting exactly on the coverage floor", () => {
    const reporting = Math.round(MIN_AREA_COVERAGE * CAPABILITY_AREA_COUNT);
    const verdict = assessMaturity(readAll(4, reporting), resolvedEvenly);
    expect(verdict.coverage).toBe(MIN_AREA_COVERAGE);
    expect(verdict.publishable).toBe(true);
  });

  it("counts an area that reported nothing the same as one that was never read", () => {
    const reporting = Math.round(MIN_AREA_COVERAGE * CAPABILITY_AREA_COUNT);
    const silent = assessMaturity(readAll(4, reporting), resolvedEvenly);
    const absent = assessMaturity(readAll(4).slice(0, reporting), resolvedEvenly);
    expect(absent.coverage).toBe(silent.coverage);
    expect(absent.index).toBe(silent.index);
    expect(absent.publishable).toBe(silent.publishable);
  });

  it("does not let an unreported area drag the index down", () => {
    const partial = assessMaturity(readAll(4, 7), resolvedEvenly);
    const complete = assessMaturity(readAll(4), resolvedEvenly);
    expect(partial.index).toBe(4);
    expect(partial.index).toBe(complete.index);
    expect(partial.coverage).toBeLessThan(complete.coverage);
  });

  it("floors at the bottom of the scale when nothing reported at all", () => {
    const verdict = assessMaturity(readAll(5, 0), resolvedEvenly);
    expect(verdict.index).toBe(MIN_MATURITY_SCORE);
    expect(verdict.level).toBe("initial");
    expect(verdict.areasReported).toBe(0);
    expect(verdict.publishable).toBe(false);
  });

  it("raises only the stronger of the two coverage issues", () => {
    const verdict = assessMaturity(readAll(5, 0), resolvedEvenly);
    expect(codes(verdict.issues)).toContain("no_area_reported");
    expect(codes(verdict.issues)).not.toContain("below_coverage_floor");
  });

  it("reports an unrecognised area at its own reading", () => {
    const verdict = assessMaturity([reading("morale", 4)], resolvedEvenly);
    expect(verdict.issues).toContainEqual({ code: "unknown_area", readingIndex: 0 });
    expect(verdict.areas).toEqual([]);
  });

  it("reports an area read twice at the repeat, keeping the first", () => {
    const verdict = assessMaturity(
      [reading("academic_practice", 5), reading("academic_practice", 1)],
      resolvedEvenly,
    );
    expect(verdict.issues).toContainEqual({ code: "duplicate_reading", readingIndex: 1 });
    expect(verdict.areas).toHaveLength(1);
    expect(verdict.index).toBe(5);
  });

  it("excludes an area the institution never weighted rather than inventing a weight", () => {
    const verdict = assessMaturity(
      [reading("academic_practice", 5), reading("learner_support", 1)],
      [{ area: "academic_practice", weight: 1 }],
    );
    expect(verdict.issues).toContainEqual({ code: "unweighted_area", readingIndex: 1 });
    expect(verdict.areasReported).toBe(1);
    expect(verdict.index).toBe(5);
  });

  it("clamps an off-scale score onto the scale and says it did", () => {
    const verdict = assessMaturity(
      [reading("academic_practice", MAX_MATURITY_SCORE + 3)],
      [{ area: "academic_practice", weight: 1 }],
    );
    expect(verdict.issues).toContainEqual({ code: "score_off_scale", readingIndex: 0 });
    expect(verdict.areas[0]?.score).toBe(MAX_MATURITY_SCORE);
  });

  it("floors a score nobody can compute rather than crediting it", () => {
    const verdict = assessMaturity(
      [reading("academic_practice", Number.NaN)],
      [{ area: "academic_practice", weight: 1 }],
    );
    expect(codes(verdict.issues)).toContain("score_off_scale");
    expect(verdict.index).toBe(MIN_MATURITY_SCORE);
  });

  it("reports an area that scored itself without pointing at anything", () => {
    const verdict = assessMaturity(
      [reading("academic_practice", 5, 0)],
      [{ area: "academic_practice", weight: 1 }],
    );
    expect(verdict.issues).toContainEqual({ code: "insufficient_evidence", readingIndex: 0 });
    expect(verdict.areas[0]?.reported).toBe(false);
    expect(verdict.areasReported).toBe(0);
  });

  it("carries every recognised weighted reading, reported or not", () => {
    const verdict = assessMaturity(readAll(4, 7), resolvedEvenly);
    expect(verdict.areas).toHaveLength(CAPABILITY_AREA_COUNT);
    expect(verdict.areas.filter((area) => area.reported)).toHaveLength(7);
  });

  it("stays on the maturity scale whatever it was given", () => {
    for (const score of [-100, 0, 1, 2.5, 5, 9, Number.NaN, Number.POSITIVE_INFINITY]) {
      const verdict = assessMaturity(readAll(score), resolvedEvenly);
      expect(verdict.index).toBeGreaterThanOrEqual(MIN_MATURITY_SCORE);
      expect(verdict.index).toBeLessThanOrEqual(MAX_MATURITY_SCORE);
    }
  });

  it("reports the level its own index sits at", () => {
    for (const score of [1, 1.9, 2, 3.4, 4, 5]) {
      const verdict = assessMaturity(readAll(score), resolvedEvenly);
      expect(verdict.level).toBe(levelForScore(verdict.index));
    }
  });
});

describe("deliberate absences", () => {
  it("publishes nothing else: the module exposes three functions and no more", () => {
    expect(Object.keys(maturity).sort()).toEqual([
      "assessMaturity",
      "inspectWeighting",
      "levelForScore",
    ]);
  });

  it("holds no clock: the same assessment always reads the same way", () => {
    const readings = readAll(4, 8);
    expect(assessMaturity(readings, resolvedEvenly)).toEqual(
      assessMaturity(readings, resolvedEvenly),
    );
  });

  it("mutates nothing it was given", () => {
    const readings = readAll(4, 8);
    const before = JSON.stringify({ readings, weights: resolvedEvenly });
    assessMaturity(readings, resolvedEvenly);
    inspectWeighting(declaredEvenly);
    expect(JSON.stringify({ readings, weights: resolvedEvenly })).toBe(before);
  });

  it("re-checks no weight it was handed, holding one opinion about a weighting rather than two", () => {
    const rejected: AreaWeight[] = [{ area: "academic_practice", weight: MAX_AREA_WEIGHT + 0.4 }];
    expect(inspectWeighting(rejected).usable).toBe(false);

    const verdict = assessMaturity(
      [reading("academic_practice", 5)],
      [{ area: "academic_practice", weight: MAX_AREA_WEIGHT + 0.4 }],
    );
    expect(verdict.areas[0]?.weight).toBe(MAX_AREA_WEIGHT + 0.4);
    expect(codes(verdict.issues)).not.toContain("weight_too_large");
  });

  it("offers no way to publish below the coverage floor", () => {
    for (let reporting = 0; reporting <= CAPABILITY_AREA_COUNT; reporting += 1) {
      const verdict = assessMaturity(readAll(5, reporting), resolvedEvenly);
      expect(verdict.publishable).toBe(verdict.coverage >= MIN_AREA_COVERAGE);
    }
  });
});
