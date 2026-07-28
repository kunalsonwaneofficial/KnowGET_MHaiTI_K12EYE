import { describe, expect, it } from "vitest";
import {
  MAX_PILLAR_WEIGHT,
  MIN_PILLAR_COVERAGE,
  MIN_PILLAR_WEIGHT,
  PILLAR_COUNT,
  type HealthPillar,
} from "./command-value";
import type { PillarWeight } from "./command-view";
import {
  MIN_DECLARED_PILLARS,
  WEIGHT_ISSUE_CODES,
  type WeightIssueCode,
  redistribute,
  redistributedWeight,
  validateWeights,
} from "./weighting";

const w = (pillar: HealthPillar, weight: number): PillarWeight => ({ pillar, weight });

/** Six pillars at a tenth each and one at four tenths: a well-formed, deliberately lopsided definition. */
const sixPillars: readonly PillarWeight[] = [
  w("academic_outcomes", 0.3),
  w("learner_wellbeing", 0.15),
  w("attendance_engagement", 0.15),
  w("teaching_quality", 0.15),
  w("financial_health", 0.15),
  w("governance_compliance", 0.1),
];

const codesOf = (weights: readonly PillarWeight[]): readonly string[] =>
  validateWeights(weights).issues.map((entry) => entry.code);

const totalOf = (weights: readonly PillarWeight[]): number =>
  weights.reduce((sum, entry) => sum + entry.weight, 0);

describe("MIN_DECLARED_PILLARS", () => {
  it("is derived from the coverage floor rather than chosen separately", () => {
    expect(MIN_DECLARED_PILLARS).toBe(Math.ceil(MIN_PILLAR_COVERAGE * PILLAR_COUNT));
    expect(MIN_DECLARED_PILLARS).toBe(6);
  });

  it("leaves room for a definition that spans every pillar", () => {
    expect(MIN_DECLARED_PILLARS).toBeLessThanOrEqual(PILLAR_COUNT);
  });

  it("is satisfiable inside the per-pillar weight band", () => {
    expect(MIN_DECLARED_PILLARS * MIN_PILLAR_WEIGHT).toBeLessThanOrEqual(1);
    expect(MIN_DECLARED_PILLARS * MAX_PILLAR_WEIGHT).toBeGreaterThanOrEqual(1);
  });
});

describe("validateWeights", () => {
  it("accepts a well-formed set", () => {
    expect(validateWeights(sixPillars)).toEqual({ usable: true, issues: [] });
  });

  it("declares every issue code it can emit, without repetition", () => {
    expect(new Set(WEIGHT_ISSUE_CODES).size).toBe(WEIGHT_ISSUE_CODES.length);
  });

  it("refuses an empty set and says nothing else about it", () => {
    expect(validateWeights([])).toEqual({
      usable: false,
      issues: [{ code: "no_pillars", pillar: null }],
    });
  });

  it("refuses a definition too narrow to be about an institution", () => {
    const narrow = [w("academic_outcomes", 0.5), w("financial_health", 0.5)];
    expect(codesOf(narrow)).toContain("too_few_pillars");
  });

  it("accepts a definition at exactly the minimum span", () => {
    expect(sixPillars).toHaveLength(MIN_DECLARED_PILLARS);
    expect(validateWeights(sixPillars).usable).toBe(true);
  });

  it("names the pillar a duplicate was declared at", () => {
    const doubled = [...sixPillars.slice(0, 5), w("academic_outcomes", 0.1)];
    expect(validateWeights(doubled).issues).toContainEqual({
      code: "duplicate_pillar",
      pillar: "academic_outcomes",
    });
  });

  it("separates a weight below the floor from one above the ceiling", () => {
    const tiny = [w("academic_outcomes", 0.001), ...sixPillars.slice(1)];
    const huge = [w("academic_outcomes", 0.9), ...sixPillars.slice(1)];
    expect(codesOf(tiny)).toContain("weight_below_minimum");
    expect(codesOf(tiny)).not.toContain("weight_above_maximum");
    expect(codesOf(huge)).toContain("weight_above_maximum");
    expect(codesOf(huge)).not.toContain("weight_below_minimum");
  });

  it("refuses a pillar holding half the index or more", () => {
    const halved: readonly PillarWeight[] = [
      w("academic_outcomes", MAX_PILLAR_WEIGHT + 0.01),
      w("learner_wellbeing", 0.13),
      w("attendance_engagement", 0.13),
      w("teaching_quality", 0.13),
      w("financial_health", 0.05),
      w("governance_compliance", 0.05),
    ];
    expect(codesOf(halved)).toContain("weight_above_maximum");
  });

  it("accepts a pillar at exactly the ceiling", () => {
    const atCeiling: readonly PillarWeight[] = [
      w("academic_outcomes", MAX_PILLAR_WEIGHT),
      w("learner_wellbeing", 0.1),
      w("attendance_engagement", 0.1),
      w("teaching_quality", 0.1),
      w("financial_health", 0.1),
      w("governance_compliance", 0.1),
    ];
    expect(validateWeights(atCeiling).usable).toBe(true);
  });

  it("refuses a set that does not total one", () => {
    const short = [...sixPillars.slice(0, 5), w("governance_compliance", 0.05)];
    expect(codesOf(short)).toContain("unbalanced_total");
  });

  it("does not complain about the total when a weight is individually impossible", () => {
    const broken = [w("academic_outcomes", 4), ...sixPillars.slice(1)];
    expect(codesOf(broken)).toContain("weight_above_maximum");
    expect(codesOf(broken)).not.toContain("unbalanced_total");
  });

  it("refuses a non-finite weight as below the floor rather than as a total problem", () => {
    const broken = [w("academic_outcomes", Number.NaN), ...sixPillars.slice(1)];
    expect(codesOf(broken)).toContain("weight_below_minimum");
  });

  it("tolerates weights that total one only after rounding", () => {
    const thirds: readonly PillarWeight[] = [
      w("academic_outcomes", 0.1667),
      w("learner_wellbeing", 0.1667),
      w("attendance_engagement", 0.1667),
      w("teaching_quality", 0.1667),
      w("financial_health", 0.1666),
      w("governance_compliance", 0.1666),
    ];
    expect(validateWeights(thirds).usable).toBe(true);
  });

  it("reports several faults at once rather than one at a time", () => {
    const messy = [w("academic_outcomes", 0.9), w("academic_outcomes", 0.9)];
    const codes = codesOf(messy);
    expect(codes).toContain("too_few_pillars");
    expect(codes).toContain("duplicate_pillar");
    expect(codes).toContain("weight_above_maximum");
  });

  it("emits only codes it declared", () => {
    const declared = new Set<string>(WEIGHT_ISSUE_CODES);
    const broken: readonly (readonly PillarWeight[])[] = [
      [],
      [w("academic_outcomes", 0.5), w("financial_health", 0.5)],
      [w("academic_outcomes", 0.001), ...sixPillars.slice(1)],
      [w("academic_outcomes", 0.9), ...sixPillars.slice(1)],
      [...sixPillars.slice(0, 5), w("governance_compliance", 0.05)],
    ];
    for (const set of broken) {
      for (const entry of validateWeights(set).issues) {
        expect(declared.has(entry.code as WeightIssueCode)).toBe(true);
      }
    }
  });
});

describe("redistribute", () => {
  it("returns the declared weights unchanged when every pillar contributes", () => {
    const survivors = redistribute(
      sixPillars,
      sixPillars.map((entry) => entry.pillar),
    );
    expect(survivors).toEqual(sixPillars);
  });

  it("renormalizes the survivors to a full weight set", () => {
    const survivors = redistribute(sixPillars, [
      "academic_outcomes",
      "learner_wellbeing",
      "attendance_engagement",
      "teaching_quality",
      "financial_health",
    ]);
    expect(survivors).toHaveLength(5);
    expect(Math.abs(totalOf(survivors) - 1)).toBeLessThan(0.001);
  });

  it("preserves the declared ratio between survivors", () => {
    const survivors = redistribute(sixPillars, ["academic_outcomes", "learner_wellbeing"]);
    const academic = survivors.find((entry) => entry.pillar === "academic_outcomes");
    const wellbeing = survivors.find((entry) => entry.pillar === "learner_wellbeing");
    expect(academic?.weight).toBeCloseTo(0.6667, 4);
    expect(wellbeing?.weight).toBeCloseTo(0.3333, 4);
  });

  it("does not flatten priorities into an equal split", () => {
    const survivors = redistribute(sixPillars, ["academic_outcomes", "governance_compliance"]);
    const academic = survivors.find((entry) => entry.pillar === "academic_outcomes");
    const governance = survivors.find((entry) => entry.pillar === "governance_compliance");
    expect(academic?.weight).toBeGreaterThan(governance?.weight ?? 0);
  });

  it("keeps declaration order, so two runs return an identical set", () => {
    const contributing: readonly HealthPillar[] = ["governance_compliance", "academic_outcomes"];
    expect(redistribute(sixPillars, contributing).map((entry) => entry.pillar)).toEqual([
      "academic_outcomes",
      "governance_compliance",
    ]);
  });

  it("returns an empty set rather than zeros when nothing survives", () => {
    expect(redistribute(sixPillars, [])).toEqual([]);
  });

  it("ignores a contributor the set never declared", () => {
    const survivors = redistribute(sixPillars, ["academic_outcomes", "transport_dummy" as never]);
    expect(survivors).toHaveLength(1);
    expect(survivors[0]?.weight).toBe(1);
  });

  it("rounds to the precision an auditor is shown, so the set used is the set reported", () => {
    const survivors = redistribute(sixPillars, ["academic_outcomes", "learner_wellbeing"]);
    for (const entry of survivors) {
      expect(entry.weight).toBe(Number(entry.weight.toFixed(4)));
    }
  });
});

describe("redistributedWeight", () => {
  it("is nothing when every declared pillar contributed", () => {
    expect(
      redistributedWeight(
        sixPillars,
        sixPillars.map((entry) => entry.pillar),
      ),
    ).toBe(0);
  });

  it("is the weight of the pillars that dropped out", () => {
    expect(redistributedWeight(sixPillars, ["academic_outcomes"])).toBeCloseTo(0.7, 4);
  });

  it("is everything when nothing contributed", () => {
    expect(redistributedWeight(sixPillars, [])).toBe(1);
  });

  it("counts a small pillar dropping out as a small displacement", () => {
    const small = redistributedWeight(sixPillars, [
      "academic_outcomes",
      "learner_wellbeing",
      "attendance_engagement",
      "teaching_quality",
      "financial_health",
    ]);
    const large = redistributedWeight(sixPillars, [
      "learner_wellbeing",
      "attendance_engagement",
      "teaching_quality",
      "financial_health",
      "governance_compliance",
    ]);
    expect(small).toBeCloseTo(0.1, 4);
    expect(large).toBeCloseTo(0.3, 4);
    expect(large).toBeGreaterThan(small);
  });

  it("never reports more displacement than there was weight", () => {
    expect(redistributedWeight(sixPillars, [])).toBeLessThanOrEqual(1);
  });
});
