import { describe, expect, it } from "vitest";
import { bandFor } from "./banding";
import { MAX_NORMALIZED_SCORE, MIN_PILLAR_COVERAGE, type HealthPillar } from "./command-value";
import type { PillarInput, PillarWeight } from "./command-view";
import { assessIndex, isCitable, rankByDrag } from "./indexing";
import { validateWeights } from "./weighting";

const w = (pillar: HealthPillar, weight: number): PillarWeight => ({ pillar, weight });

const read = (
  pillar: HealthPillar,
  score: number,
  kpisRead = 8,
  kpisDeclared = 8,
): PillarInput => ({
  pillar,
  score,
  kpisRead,
  kpisDeclared,
});

/** A six-pillar definition weighted the way a school with an academic focus would weight one. */
const definition: readonly PillarWeight[] = [
  w("academic_outcomes", 0.3),
  w("learner_wellbeing", 0.15),
  w("attendance_engagement", 0.15),
  w("teaching_quality", 0.15),
  w("financial_health", 0.15),
  w("governance_compliance", 0.1),
];

/** Every pillar reporting, all of them healthy-ish. */
const fullReturn: readonly PillarInput[] = [
  read("academic_outcomes", 80),
  read("learner_wellbeing", 70),
  read("attendance_engagement", 90),
  read("teaching_quality", 75),
  read("financial_health", 60),
  read("governance_compliance", 85),
];

const pillarsOf = (inputs: readonly PillarInput[]): readonly HealthPillar[] =>
  inputs.map((entry) => entry.pillar);

describe("assessIndex", () => {
  it("works from a definition the weight validator accepts", () => {
    expect(validateWeights(definition).usable).toBe(true);
  });

  it("computes the weighted mean of the pillars that reported", () => {
    const verdict = assessIndex(definition, fullReturn);
    // 24 + 10.5 + 13.5 + 11.25 + 9 + 8.5, from weights .3/.15/.15/.15/.15/.1 on 80/70/90/75/60/85.
    expect(verdict.value).toBe(76.75);
    expect(verdict.band).toBe("healthy");
  });

  it("reports full coverage and no redistribution for a complete return", () => {
    const verdict = assessIndex(definition, fullReturn);
    expect(verdict.pillarCoverage).toBe(1);
    expect(verdict.weightRedistributed).toBe(0);
    expect(verdict.omissions).toEqual([]);
    expect(verdict.contributions).toHaveLength(definition.length);
  });

  it("weights the composite rather than averaging it", () => {
    const weighted = assessIndex(definition, fullReturn).value;
    const unweighted = fullReturn.reduce((sum, entry) => sum + entry.score, 0) / fullReturn.length;
    expect(weighted).not.toBe(unweighted);
  });

  it("moves with the pillar the institution said mattered most", () => {
    const heavier = assessIndex(definition, [
      read("academic_outcomes", 90),
      ...fullReturn.slice(1),
    ]).value;
    const lighter = assessIndex(definition, [
      ...fullReturn.slice(0, 5),
      read("governance_compliance", 95),
    ]).value;
    const base = assessIndex(definition, fullReturn).value ?? 0;
    expect((heavier ?? 0) - base).toBeGreaterThan((lighter ?? 0) - base);
  });
});

describe("assessIndex — a pillar that did not report", () => {
  const partial = fullReturn.filter((entry) => entry.pillar !== "learner_wellbeing");

  it("excludes it rather than scoring it zero", () => {
    const verdict = assessIndex(definition, partial);
    const zeroed = assessIndex(definition, [...partial, read("learner_wellbeing", 0)]);
    expect(verdict.value).toBeGreaterThan(zeroed.value ?? 0);
  });

  it("does not let a silent pillar read as a crisis", () => {
    const verdict = assessIndex(definition, partial);
    expect(verdict.band).toBe("healthy");
  });

  it("records the omission with a reason and the weight it left behind", () => {
    const verdict = assessIndex(definition, partial);
    expect(verdict.omissions).toContainEqual({
      pillar: "learner_wellbeing",
      reason: "kpi_coverage",
      declaredWeight: 0.15,
      kpiCoverage: 0,
    });
  });

  it("redistributes its weight across the survivors in proportion", () => {
    const verdict = assessIndex(definition, partial);
    expect(verdict.weightRedistributed).toBeCloseTo(0.15, 4);
    const academic = verdict.contributions.find((c) => c.pillar === "academic_outcomes");
    expect(academic?.declaredWeight).toBe(0.3);
    expect(academic?.effectiveWeight).toBeCloseTo(0.3 / 0.85, 4);
  });

  it("keeps every survivor's effective weight summing to a whole index", () => {
    const verdict = assessIndex(definition, partial);
    const total = verdict.contributions.reduce((sum, c) => sum + c.effectiveWeight, 0);
    expect(Math.abs(total - 1)).toBeLessThan(0.001);
  });

  it("still reports coverage below one, so nobody mistakes it for a full return", () => {
    const verdict = assessIndex(definition, partial);
    expect(verdict.pillarCoverage).toBeCloseTo(5 / 6, 4);
  });
});

describe("assessIndex — coverage floors", () => {
  it("excludes a pillar that reported too few of its own KPIs", () => {
    const thin = [read("financial_health", 20, 2, 9), ...fullReturn.slice(0, 5)];
    const verdict = assessIndex(definition, thin);
    expect(verdict.omissions).toContainEqual({
      pillar: "financial_health",
      reason: "kpi_coverage",
      declaredWeight: 0.15,
      kpiCoverage: expect.closeTo(2 / 9, 4) as unknown as number,
    });
  });

  it("admits a pillar sitting exactly on the KPI floor", () => {
    const onFloor = [
      read("financial_health", 60, 5, 10),
      ...fullReturn.filter((entry) => entry.pillar !== "financial_health"),
    ];
    const verdict = assessIndex(definition, onFloor);
    expect(pillarsOf(fullReturn)).toContain("financial_health");
    expect(verdict.contributions.map((c) => c.pillar)).toContain("financial_health");
  });

  it("marks an assessment below the pillar floor insufficient without discarding it", () => {
    const twoOfSix = fullReturn.slice(0, 2);
    const verdict = assessIndex(definition, twoOfSix);
    expect(verdict.value).not.toBeNull();
    expect(verdict.sufficient).toBe(false);
    expect(verdict.pillarCoverage).toBeCloseTo(2 / 6, 4);
  });

  it("calls an assessment exactly on the floor sufficient", () => {
    const fourOfSix = fullReturn.slice(0, 4);
    const verdict = assessIndex(definition, fourOfSix);
    expect(verdict.pillarCoverage).toBeCloseTo(4 / 6, 4);
    expect(verdict.pillarCoverage).toBeGreaterThanOrEqual(MIN_PILLAR_COVERAGE);
    expect(verdict.sufficient).toBe(true);
  });

  it("returns no index at all when nothing contributed", () => {
    const verdict = assessIndex(definition, []);
    expect(verdict.value).toBeNull();
    expect(verdict.band).toBeNull();
    expect(verdict.sufficient).toBe(false);
    expect(verdict.contributions).toEqual([]);
    expect(verdict.weightRedistributed).toBe(1);
  });

  it("does not report an institution that went silent as an institution in crisis", () => {
    expect(assessIndex(definition, []).band).not.toBe("failing");
  });
});

describe("assessIndex — inputs the definition did not ask for", () => {
  it("sets aside a pillar the definition never declared", () => {
    const verdict = assessIndex(definition, [...fullReturn, read("transport_extra" as never, 95)]);
    expect(verdict.omissions).toContainEqual({
      pillar: "transport_extra",
      reason: "not_weighted",
      declaredWeight: 0,
      kpiCoverage: 1,
    });
  });

  it("does not let an undeclared pillar move the composite", () => {
    const withExtra = assessIndex(definition, [
      ...fullReturn,
      read("admissions_growth" as never, 100),
    ]);
    expect(withExtra.value).toBe(assessIndex(definition, fullReturn).value);
  });

  it("notes an undeclared pillar once however many times it was sent", () => {
    const verdict = assessIndex(definition, [
      ...fullReturn,
      read("admissions_growth", 100),
      read("admissions_growth", 40),
    ]);
    const noted = verdict.omissions.filter((entry) => entry.pillar === "admissions_growth");
    expect(noted).toHaveLength(1);
  });

  it("takes the first reading when a declared pillar reports twice", () => {
    const verdict = assessIndex(definition, [
      read("academic_outcomes", 80),
      read("academic_outcomes", 10),
      ...fullReturn.slice(1),
    ]);
    expect(verdict.value).toBe(assessIndex(definition, fullReturn).value);
  });

  it("excludes a pillar whose score is not on the normalized scale", () => {
    const verdict = assessIndex(definition, [
      read("academic_outcomes", Number.NaN),
      ...fullReturn.slice(1),
    ]);
    expect(verdict.omissions).toContainEqual({
      pillar: "academic_outcomes",
      reason: "unscoreable",
      declaredWeight: 0.3,
      kpiCoverage: 1,
    });
  });

  it("excludes an out-of-range score rather than clamping it into the composite", () => {
    const verdict = assessIndex(definition, [
      read("academic_outcomes", 140),
      ...fullReturn.slice(1),
    ]);
    expect(verdict.omissions.map((entry) => entry.reason)).toContain("unscoreable");
    expect(verdict.contributions.map((c) => c.pillar)).not.toContain("academic_outcomes");
  });
});

describe("assessIndex — the derivation travels with the value", () => {
  it("bands each contributing pillar as well as the composite", () => {
    const verdict = assessIndex(definition, fullReturn);
    const finance = verdict.contributions.find((c) => c.pillar === "financial_health");
    expect(finance?.band).toBe(bandFor(60));
  });

  it("adds its shares back up to the composite", () => {
    const verdict = assessIndex(definition, fullReturn);
    const shares = verdict.contributions.reduce((sum, c) => sum + c.share, 0);
    expect(shares).toBeCloseTo(verdict.value ?? 0, 4);
  });

  it("adds its shortfalls up to what the composite is missing", () => {
    const verdict = assessIndex(definition, fullReturn);
    const shortfalls = verdict.contributions.reduce((sum, c) => sum + c.shortfall, 0);
    expect(shortfalls).toBeCloseTo(MAX_NORMALIZED_SCORE - (verdict.value ?? 0), 4);
  });

  it("accounts for every declared pillar as either a contribution or an omission", () => {
    const partial = fullReturn.slice(0, 3);
    const verdict = assessIndex(definition, partial);
    const accounted = [
      ...verdict.contributions.map((c) => c.pillar),
      ...verdict.omissions.map((o) => o.pillar),
    ];
    for (const declared of definition) {
      expect(accounted).toContain(declared.pillar);
    }
  });

  it("carries each pillar's KPI coverage alongside its score", () => {
    const verdict = assessIndex(definition, [
      read("academic_outcomes", 80, 6, 8),
      ...fullReturn.slice(1),
    ]);
    const academic = verdict.contributions.find((c) => c.pillar === "academic_outcomes");
    expect(academic?.kpiCoverage).toBeCloseTo(0.75, 4);
  });

  it("orders contributions the way the definition declared them", () => {
    const verdict = assessIndex(definition, [...fullReturn].reverse());
    expect(verdict.contributions.map((c) => c.pillar)).toEqual(definition.map((d) => d.pillar));
  });

  it("gives the same answer twice for the same inputs", () => {
    expect(assessIndex(definition, fullReturn)).toEqual(assessIndex(definition, fullReturn));
  });
});

describe("rankByDrag", () => {
  it("leads with the pillar costing the index most points, not the lowest score", () => {
    const verdict = assessIndex(definition, [
      read("academic_outcomes", 65),
      read("learner_wellbeing", 70),
      read("attendance_engagement", 90),
      read("teaching_quality", 75),
      read("financial_health", 90),
      read("governance_compliance", 40),
    ]);
    const ranked = rankByDrag(verdict);
    // governance scores worst (40) but holds a tenth; academic at 65 holds three tenths.
    expect(ranked[0]?.pillar).toBe("academic_outcomes");
    expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score ?? 0);
  });

  it("orders every pillar by descending shortfall", () => {
    const ranked = rankByDrag(assessIndex(definition, fullReturn));
    for (let i = 1; i < ranked.length; i += 1) {
      expect(ranked[i - 1]?.shortfall).toBeGreaterThanOrEqual(ranked[i]?.shortfall ?? 0);
    }
  });

  it("does not mutate the verdict it ranks", () => {
    const verdict = assessIndex(definition, fullReturn);
    const before = verdict.contributions.map((c) => c.pillar);
    rankByDrag(verdict);
    expect(verdict.contributions.map((c) => c.pillar)).toEqual(before);
  });

  it("has nothing to rank when nothing contributed", () => {
    expect(rankByDrag(assessIndex(definition, []))).toEqual([]);
  });
});

describe("isCitable", () => {
  it("admits a complete assessment", () => {
    expect(isCitable(assessIndex(definition, fullReturn))).toBe(true);
  });

  it("refuses one below the coverage floor", () => {
    expect(isCitable(assessIndex(definition, fullReturn.slice(0, 2)))).toBe(false);
  });

  it("refuses one with no value at all", () => {
    expect(isCitable(assessIndex(definition, []))).toBe(false);
  });

  it("is a judgement about coverage and never about the number", () => {
    const bleak = assessIndex(
      definition,
      definition.map((entry) => read(entry.pillar, 5)),
    );
    expect(bleak.band).toBe("failing");
    expect(isCitable(bleak)).toBe(true);
  });
});
