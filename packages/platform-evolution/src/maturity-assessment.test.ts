import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  AssessmentNotPublishableError,
  AssessmentPublishedError,
  EmptyAssessmentKeyError,
  InvalidAssessmentKeyError,
  InvalidAssessmentPeriodError,
  RepeatAreaReadingError,
  ScoreOffScaleError,
  UnknownCapabilityAreaError,
  UnusableWeightingError,
  UnweightedAreaError,
} from "./errors";
import {
  CAPABILITY_AREAS,
  CAPABILITY_AREA_COUNT,
  MATURITY_LEVELS,
  MAX_MATURITY_SCORE,
  MAX_PERIOD,
  MIN_AREA_COVERAGE,
  MIN_MATURITY_SCORE,
} from "./evolution-value";
import type { AreaWeight } from "./evolution-view";
import {
  type MaturityAssessment,
  type OpenAssessmentParams,
  assessmentUnassessedAreas,
  assessmentUnevidencedAreas,
  isAssessmentPublished,
  openAssessment,
  publishAssessment,
  recordAreaReading,
} from "./maturity-assessment";
import * as assessmentModule from "./maturity-assessment";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;
const OPENER = "person-1" as Uuid;
const ACTOR = "person-9" as Uuid;

/** Ten areas at a tenth each. The weighting an institution declares when it has no opinion yet. */
const EVEN_WEIGHTS: readonly AreaWeight[] = CAPABILITY_AREAS.map((area) => ({ area, weight: 0.1 }));

/**
 * Six areas, one of them carrying half the score.
 *
 * Two things at once: it proves the index is weighted rather than averaged, and it is a weighting that can never
 * reach the coverage floor — six areas out of ten — which is what the coverage tests need.
 */
const SKEWED_WEIGHTS: readonly AreaWeight[] = [
  { area: "governance_and_leadership", weight: 0.5 },
  { area: "academic_practice", weight: 0.1 },
  { area: "learner_support", weight: 0.1 },
  { area: "staff_capability", weight: 0.1 },
  { area: "operational_process", weight: 0.1 },
  { area: "financial_stewardship", weight: 0.1 },
];

const opening = (overrides: Partial<OpenAssessmentParams> = {}): OpenAssessmentParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  assessmentKey: "annual.self-assessment",
  period: 3,
  weights: EVEN_WEIGHTS,
  openedBy: OPENER,
  ...overrides,
});

const opened = (overrides: Partial<OpenAssessmentParams> = {}): MaturityAssessment =>
  openAssessment(opening(overrides));

/** The first `count` capability areas scored the same, each with evidence behind it. */
const scored = (count: number, score = 4): MaturityAssessment =>
  CAPABILITY_AREAS.slice(0, count).reduce<MaturityAssessment>(
    (assessment, area) => recordAreaReading(assessment, { area, score, evidenceCount: 2 }),
    opened(),
  );

/** Every area the skewed weighting names, scored. Fully assessed against its own weighting, and still 0.6. */
const fullySkewed = (): MaturityAssessment =>
  SKEWED_WEIGHTS.reduce<MaturityAssessment>(
    (assessment, entry) =>
      recordAreaReading(assessment, { area: entry.area, score: 3, evidenceCount: 1 }),
    opened({ weights: SKEWED_WEIGHTS }),
  );

const issuesOf = (thrown: UnusableWeightingError | null): readonly string[] =>
  (thrown?.details as { issues: readonly string[] } | undefined)?.issues ?? [];

const refuseWeighting = (weights: readonly AreaWeight[]): UnusableWeightingError | null => {
  let thrown: UnusableWeightingError | null = null;
  try {
    opened({ weights });
  } catch (error) {
    thrown = error as UnusableWeightingError;
  }
  expect(thrown).toBeInstanceOf(UnusableWeightingError);
  return thrown;
};

describe("openAssessment", () => {
  it("normalizes the key so one assessment is quoted the same way everywhere", () => {
    expect(opened({ assessmentKey: "  Annual.Self-Assessment  " }).assessmentKey).toBe(
      "annual.self-assessment",
    );
  });

  it("refuses a key that is nothing but space", () => {
    expect(() => opened({ assessmentKey: "   " })).toThrow(EmptyAssessmentKeyError);
  });

  it("refuses a key the vocabulary would not recognise", () => {
    expect(() => opened({ assessmentKey: "annual..self" })).toThrow(InvalidAssessmentKeyError);
  });

  it("refuses a period off the grid the caller declared", () => {
    let thrown: InvalidAssessmentPeriodError | null = null;
    try {
      opened({ period: MAX_PERIOD + 1 });
    } catch (error) {
      thrown = error as InvalidAssessmentPeriodError;
    }
    expect(thrown).toBeInstanceOf(InvalidAssessmentPeriodError);
    expect(thrown?.details).toMatchObject({ period: MAX_PERIOD + 1 });
  });

  it("refuses a weighting that does not sum to one", () => {
    expect(issuesOf(refuseWeighting(EVEN_WEIGHTS.slice(0, 9)))).toEqual(["weights_do_not_sum"]);
  });

  it("refuses an assessment that declared nothing matters", () => {
    expect(issuesOf(refuseWeighting([]))).toEqual(["no_weights"]);
  });

  it("refuses an area weighted twice", () => {
    const doubled = [
      ...EVEN_WEIGHTS.slice(0, 9),
      { area: "governance_and_leadership", weight: 0.1 },
    ];
    expect(issuesOf(refuseWeighting(doubled))).toContain("duplicate_area");
  });

  it("refuses a weight on something that is not a capability area", () => {
    const invented = [...EVEN_WEIGHTS.slice(0, 9), { area: "financial_planning", weight: 0.1 }];
    expect(issuesOf(refuseWeighting(invented))).toContain("unknown_area");
  });

  it("refuses a single area weighted above the cap, and one weighted below the floor", () => {
    const heavy = [{ area: "governance_and_leadership", weight: 0.6 }, ...EVEN_WEIGHTS.slice(1)];
    const slight = [{ area: "governance_and_leadership", weight: 0.001 }, ...EVEN_WEIGHTS.slice(1)];
    expect(issuesOf(refuseWeighting(heavy))).toContain("weight_too_large");
    expect(issuesOf(refuseWeighting(slight))).toContain("weight_too_small");
  });

  it("reports every fault at once, so a weighting is fixed in one pass", () => {
    const broken = [
      { area: "governance_and_leadership", weight: 0.6 },
      { area: "financial_planning", weight: 0.1 },
      ...EVEN_WEIGHTS.slice(2),
    ];
    const issues = issuesOf(refuseWeighting(broken));
    expect(issues).toContain("weight_too_large");
    expect(issues).toContain("unknown_area");
  });

  it("stores the weighting the engine resolved rather than the one the caller typed", () => {
    const mixed = [
      { area: "  Governance_And_Leadership  ", weight: 0.1 },
      ...EVEN_WEIGHTS.slice(1),
    ];
    expect(opened({ weights: mixed }).weights.map((entry) => entry.area)).toEqual([
      ...CAPABILITY_AREAS,
    ]);
  });

  it("opens at the floor of the scale, covering nothing and publishable by nobody", () => {
    const assessment = opened();
    expect(assessment.areas).toHaveLength(0);
    expect(assessment.areasReported).toBe(0);
    expect(assessment.coverage).toBe(0);
    expect(assessment.index).toBe(MIN_MATURITY_SCORE);
    expect(assessment.publishable).toBe(false);
    expect(assessment.publishedAt).toBeNull();
    expect(assessment.publishedBy).toBeNull();
  });
});

describe("recordAreaReading", () => {
  it("normalizes the area name before it looks for it", () => {
    const assessment = recordAreaReading(opened(), {
      area: "  Governance_And_Leadership  ",
      score: 4,
      evidenceCount: 2,
    });
    expect(assessment.areas.map((outcome) => outcome.area)).toEqual(["governance_and_leadership"]);
  });

  it("refuses an area the vocabulary does not have", () => {
    let thrown: UnknownCapabilityAreaError | null = null;
    try {
      recordAreaReading(opened(), { area: "financial_planning", score: 4, evidenceCount: 2 });
    } catch (error) {
      thrown = error as UnknownCapabilityAreaError;
    }
    expect(thrown).toBeInstanceOf(UnknownCapabilityAreaError);
    expect(thrown?.details).toMatchObject({ area: "financial_planning" });
  });

  it("refuses a second reading for an area already read", () => {
    let thrown: RepeatAreaReadingError | null = null;
    try {
      recordAreaReading(scored(1), {
        area: "governance_and_leadership",
        score: 2,
        evidenceCount: 2,
      });
    } catch (error) {
      thrown = error as RepeatAreaReadingError;
    }
    expect(thrown).toBeInstanceOf(RepeatAreaReadingError);
    expect(thrown?.details).toMatchObject({ area: "governance_and_leadership" });
  });

  it("refuses an area this assessment gave no weight to", () => {
    let thrown: UnweightedAreaError | null = null;
    try {
      recordAreaReading(opened({ weights: SKEWED_WEIGHTS }), {
        area: "data_and_information",
        score: 4,
        evidenceCount: 2,
      });
    } catch (error) {
      thrown = error as UnweightedAreaError;
    }
    expect(thrown).toBeInstanceOf(UnweightedAreaError);
    expect(thrown?.details).toMatchObject({ area: "data_and_information" });
  });

  it("refuses a score off the scale rather than clamping it into one nobody wrote", () => {
    let thrown: ScoreOffScaleError | null = null;
    try {
      recordAreaReading(opened(), {
        area: "governance_and_leadership",
        score: MAX_MATURITY_SCORE + 1,
        evidenceCount: 2,
      });
    } catch (error) {
      thrown = error as ScoreOffScaleError;
    }
    expect(thrown).toBeInstanceOf(ScoreOffScaleError);
    expect(thrown?.details).toMatchObject({
      area: "governance_and_leadership",
      score: MAX_MATURITY_SCORE + 1,
      minimum: MIN_MATURITY_SCORE,
      maximum: MAX_MATURITY_SCORE,
    });

    expect(() =>
      recordAreaReading(opened(), {
        area: "governance_and_leadership",
        score: MIN_MATURITY_SCORE - 1,
        evidenceCount: 2,
      }),
    ).toThrow(ScoreOffScaleError);
  });

  it("accepts a score sitting exactly on either end of the scale", () => {
    expect(scored(1, MIN_MATURITY_SCORE).index).toBe(MIN_MATURITY_SCORE);
    expect(scored(1, MAX_MATURITY_SCORE).index).toBe(MAX_MATURITY_SCORE);
  });

  it("stores a score nobody could point at anything for, and does not count it", () => {
    const assessment = recordAreaReading(opened(), {
      area: "governance_and_leadership",
      score: 5,
      evidenceCount: 0,
    });
    expect(assessment.areas).toHaveLength(1);
    expect(assessment.areasReported).toBe(0);
    expect(assessment.coverage).toBe(0);
    expect(assessment.index).toBe(MIN_MATURITY_SCORE);
  });

  it("re-derives the whole standing from every stored reading, not just the new one", () => {
    expect(scored(3, 5).index).toBe(MAX_MATURITY_SCORE);
    expect(scored(3).index).toBe(4);
    expect(scored(3).areasReported).toBe(3);
    expect(scored(3).coverage).toBe(3 / CAPABILITY_AREA_COUNT);
  });

  it("weights the index by what the institution said matters rather than averaging it", () => {
    const weighted = recordAreaReading(
      recordAreaReading(opened({ weights: SKEWED_WEIGHTS }), {
        area: "governance_and_leadership",
        score: 5,
        evidenceCount: 2,
      }),
      { area: "academic_practice", score: 1, evidenceCount: 2 },
    );
    expect(weighted.index).toBe(4.33);
    expect(weighted.level).toBe("managed");
  });

  it("refuses a reading once the index has an audience", () => {
    const published = publishAssessment(scored(7), ACTOR);
    expect(() =>
      recordAreaReading(published, {
        area: "stakeholder_engagement",
        score: 4,
        evidenceCount: 2,
      }),
    ).toThrow(AssessmentPublishedError);
  });
});

describe("publishAssessment", () => {
  it("refuses an index computed from too little of the institution", () => {
    let thrown: AssessmentNotPublishableError | null = null;
    try {
      publishAssessment(scored(6), ACTOR);
    } catch (error) {
      thrown = error as AssessmentNotPublishableError;
    }
    expect(thrown).toBeInstanceOf(AssessmentNotPublishableError);
    expect(thrown?.details).toMatchObject({
      coverage: 6 / CAPABILITY_AREA_COUNT,
      required: MIN_AREA_COVERAGE,
    });
  });

  it("publishes an assessment sitting exactly on the coverage floor", () => {
    expect(scored(7).coverage).toBe(MIN_AREA_COVERAGE);
    expect(isAssessmentPublished(publishAssessment(scored(7), ACTOR))).toBe(true);
  });

  it("counts coverage against all ten areas rather than against the ones weighted", () => {
    const complete = fullySkewed();
    expect(complete.areasReported).toBe(SKEWED_WEIGHTS.length);
    expect(assessmentUnassessedAreas(complete)).toHaveLength(0);
    expect(complete.publishable).toBe(false);
    expect(() => publishAssessment(complete, ACTOR)).toThrow(AssessmentNotPublishableError);
  });

  it("stamps who published it and when", () => {
    const published = publishAssessment(scored(7), ACTOR);
    expect(published.publishedBy).toBe(ACTOR);
    expect(published.publishedAt).not.toBeNull();
  });

  it("refuses to publish the same index twice", () => {
    expect(() => publishAssessment(publishAssessment(scored(7), ACTOR), ACTOR)).toThrow(
      AssessmentPublishedError,
    );
  });
});

describe("reading an assessment", () => {
  it("knows whether the index has an audience", () => {
    expect(isAssessmentPublished(scored(7))).toBe(false);
    expect(isAssessmentPublished(publishAssessment(scored(7), ACTOR))).toBe(true);
  });

  it("lists what is left to score, and lists nothing the weighting left out", () => {
    const partial = recordAreaReading(opened({ weights: SKEWED_WEIGHTS }), {
      area: "governance_and_leadership",
      score: 3,
      evidenceCount: 1,
    });
    const outstanding = assessmentUnassessedAreas(partial);
    expect(outstanding).toHaveLength(SKEWED_WEIGHTS.length - 1);
    expect(outstanding).not.toContain("governance_and_leadership");
    expect(outstanding).not.toContain("data_and_information");
  });

  it("names the areas somebody scored on impression, separately from the ones nobody took", () => {
    const impression = recordAreaReading(scored(2), {
      area: "learner_support",
      score: 4,
      evidenceCount: 0,
    });
    expect(assessmentUnevidencedAreas(impression)).toEqual(["learner_support"]);
    expect(assessmentUnassessedAreas(impression)).not.toContain("learner_support");
  });
});

describe("deliberate absences", () => {
  it("publishes exactly the surface an assessment has and nothing more", () => {
    expect(Object.keys(assessmentModule).sort()).toEqual([
      "assessmentUnassessedAreas",
      "assessmentUnevidencedAreas",
      "isAssessmentPublished",
      "openAssessment",
      "publishAssessment",
      "recordAreaReading",
    ]);
  });

  it("offers no way to change what matters after it has seen a score", () => {
    const names = Object.keys(assessmentModule).join(" ").toLowerCase();
    for (const forbidden of ["reweight", "declareweights", "setweight", "adjust", "rescore"]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it("offers no way to take back an index the institution has already quoted", () => {
    const names = Object.keys(assessmentModule).join(" ").toLowerCase();
    for (const forbidden of ["unpublish", "retract", "delete", "amend", "override"]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it("mutates nothing it was given", () => {
    const assessment = scored(7);
    const before = JSON.stringify(assessment);
    publishAssessment(assessment, ACTOR);
    recordAreaReading(assessment, { area: "stakeholder_engagement", score: 2, evidenceCount: 1 });
    expect(JSON.stringify(assessment)).toBe(before);
  });

  it("moves the updated stamp on every change and never the created one", () => {
    const assessment = opened();
    const read = recordAreaReading(assessment, {
      area: "governance_and_leadership",
      score: 4,
      evidenceCount: 2,
    });
    expect(read.createdAt).toBe(assessment.createdAt);
    expect(read.id).toBe(assessment.id);
    expect(read.assessmentKey).toBe(assessment.assessmentKey);
    expect(read.weights).toEqual(assessment.weights);
  });

  it("reports a level from the five the vocabulary declares, at every score on the scale", () => {
    const levels = [1, 2, 3, 4, 5].map((score) => scored(7, score).level);
    for (const level of levels) expect(MATURITY_LEVELS).toContain(level);
    expect(new Set(levels).size).toBe(MATURITY_LEVELS.length);
  });
});
