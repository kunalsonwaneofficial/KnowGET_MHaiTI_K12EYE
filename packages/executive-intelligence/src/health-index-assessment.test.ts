import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { ASSESSMENT_STATUSES, type HealthPillar } from "./command-value";
import type { EvidenceCitation, PillarInput, PillarWeight, TracedReading } from "./command-view";
import {
  AssessmentAlreadyInvalidatedError,
  AssessmentNotProvisionalError,
  IndexNotPublishedError,
  InsufficientAssessmentCoverageError,
  NonOrdinalAssessmentPeriodError,
  UngroundedAssessmentError,
} from "./errors";
import {
  type AssessHealthIndexParams,
  type HealthIndexAssessment,
  assessHealthIndex,
  finalizeAssessment,
  invalidateAssessment,
  isAssessmentFinal,
  isAssessmentFinalizable,
  isAssessmentInvalidated,
  pillarContributionIn,
  reproduceAssessment,
  toIndexVerdict,
  toIndexWatch,
  toPillarWatch,
  toRecordedIndex,
} from "./health-index-assessment";
import {
  type HealthIndexDefinition,
  defineHealthIndex,
  publishHealthIndex,
  retireHealthIndex,
  supersedeHealthIndex,
} from "./health-index-definition";
import { isCitable, rankByDrag } from "./indexing";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;

const WEIGHTS: readonly PillarWeight[] = [
  { pillar: "academic_outcomes", weight: 0.25 },
  { pillar: "teaching_quality", weight: 0.2 },
  { pillar: "attendance_engagement", weight: 0.2 },
  { pillar: "financial_health", weight: 0.15 },
  { pillar: "learner_wellbeing", weight: 0.1 },
  { pillar: "workforce_capacity", weight: 0.1 },
];

const drafted = (): HealthIndexDefinition =>
  defineHealthIndex({
    tenantId: TENANT,
    organizationId: ORG,
    indexKey: "institutional.health",
    name: "Institutional health",
    grain: "term",
    weights: WEIGHTS,
  });

const definition = (): HealthIndexDefinition => publishHealthIndex(drafted());

const reported = (pillar: HealthPillar, score: number): PillarInput => ({
  pillar,
  score,
  kpisRead: 4,
  kpisDeclared: 5,
});

const inputs = (pairs: readonly (readonly [HealthPillar, number])[]): readonly PillarInput[] =>
  pairs.map(([pillar, score]) => reported(pillar, score));

/** Every declared pillar reporting. Weighted out at exactly 70, which is the floor of `healthy`. */
const FULL: readonly PillarInput[] = inputs([
  ["academic_outcomes", 80],
  ["teaching_quality", 70],
  ["attendance_engagement", 90],
  ["financial_health", 60],
  ["learner_wellbeing", 50],
  ["workforce_capacity", 40],
]);

/** Three of six pillars: half the composition, under the six-in-ten floor an assessment must clear. */
const THIN: readonly PillarInput[] = inputs([
  ["academic_outcomes", 80],
  ["teaching_quality", 70],
  ["attendance_engagement", 90],
]);

const cite = (ref: string): EvidenceCitation => ({
  kind: "domain_record",
  sourceDomain: "attendance",
  sourceRef: ref,
  attestedBy: null,
});

const traced = (kpiKey: string, period: number): TracedReading => ({
  kpiKey,
  period,
  citations: [cite(kpiKey)],
});

/** Cites nothing, so the audit can follow it back to nowhere. */
const untraceable = (kpiKey: string, period: number): TracedReading => ({
  kpiKey,
  period,
  citations: [],
});

const GROUNDED: readonly TracedReading[] = [
  traced("attendance.rate", 7),
  traced("finance.days", 6),
];

const params = (patch: Partial<AssessHealthIndexParams> = {}): AssessHealthIndexParams => ({
  period: 7,
  inputs: FULL,
  readings: GROUNDED,
  ...patch,
});

const assess = (patch: Partial<AssessHealthIndexParams> = {}): HealthIndexAssessment =>
  assessHealthIndex(definition(), params(patch));

const finalized = (patch: Partial<AssessHealthIndexParams> = {}): HealthIndexAssessment =>
  finalizeAssessment(assess(patch));

const invalidated = (patch: Partial<AssessHealthIndexParams> = {}): HealthIndexAssessment =>
  invalidateAssessment(assess(patch), "Feed was double-counting");

/** Whether finalization would in fact go through, so the read-side predicate can be held against it. */
const finalizes = (assessment: HealthIndexAssessment): boolean => {
  try {
    finalizeAssessment(assessment);
    return true;
  } catch {
    return false;
  }
};

describe("computing an assessment", () => {
  it("takes its identity from the definition in hand rather than being told", () => {
    const published = definition();
    const assessment = assessHealthIndex(published, params());

    expect(assessment.tenantId).toBe(published.tenantId);
    expect(assessment.organizationId).toBe(ORG);
    expect(assessment.indexDefinitionId).toBe(published.id);
    expect(assessment.indexKey).toBe("institutional.health");
    expect(assessment.grain).toBe("term");
  });

  it("starts provisional, with nothing said about standing behind it", () => {
    const assessment = assess();

    expect(assessment.status).toBe("provisional");
    expect(assessment.finalizedAt).toBeNull();
    expect(assessment.invalidatedAt).toBeNull();
    expect(assessment.invalidationReason).toBeNull();
  });

  it("flattens the composite onto the record so a series can be queried", () => {
    const assessment = assess();

    expect(assessment.value).toBe(70);
    expect(assessment.band).toBe("healthy");
    expect(assessment.pillarCoverage).toBe(1);
    expect(assessment.sufficient).toBe(true);
    expect(assessment.weightRedistributed).toBe(0);
    expect(assessment.contributions).toHaveLength(6);
    expect(assessment.omissions).toEqual([]);
  });

  it("refuses a composition still being argued about", () => {
    let thrown: unknown;
    try {
      assessHealthIndex(drafted(), params());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(IndexNotPublishedError);
    expect((thrown as IndexNotPublishedError).details).toEqual({
      indexKey: "institutional.health",
      status: "draft",
    });
    expect((thrown as IndexNotPublishedError).httpStatus).toBe(409);
  });

  it("refuses a composition that has handed over to a successor", () => {
    let thrown: unknown;
    try {
      assessHealthIndex(supersedeHealthIndex(definition(), "def-2" as Uuid), params());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(IndexNotPublishedError);
    expect((thrown as IndexNotPublishedError).details).toMatchObject({ status: "superseded" });
  });

  it("refuses a composition the institution stopped computing", () => {
    let thrown: unknown;
    try {
      assessHealthIndex(retireHealthIndex(drafted()), params());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(IndexNotPublishedError);
  });

  it("refuses a period that could not order a series or age a reading", () => {
    let thrown: unknown;
    try {
      assess({ period: 7.5 });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(NonOrdinalAssessmentPeriodError);
    expect((thrown as NonOrdinalAssessmentPeriodError).details).toEqual({ period: 7.5 });
    expect((thrown as NonOrdinalAssessmentPeriodError).httpStatus).toBe(422);
  });

  it("refuses a period that is not a number at all", () => {
    for (const period of [Number.NaN, Number.POSITIVE_INFINITY]) {
      let thrown: unknown;
      try {
        assess({ period });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(NonOrdinalAssessmentPeriodError);
    }
  });

  it("computes on thin coverage rather than refusing, because the hole is the diagnostic", () => {
    const assessment = assess({ inputs: THIN });

    expect(assessment.value).not.toBeNull();
    expect(assessment.pillarCoverage).toBe(0.5);
    expect(assessment.sufficient).toBe(false);
    expect(assessment.status).toBe("provisional");
  });

  it("computes with no admitted evidence at all rather than swallowing the assessment", () => {
    const assessment = assess({ readings: [untraceable("attendance.rate", 7)] });

    expect(assessment.evidence.admitted).toBe(0);
    expect(assessment.evidence.untraceable).toBe(1);
    expect(assessment.value).toBe(70);
  });

  it("audits the readings at its own period, so age is a fact about this assessment", () => {
    const assessment = assess();

    expect(assessment.evidence.admitted).toBe(2);
    expect(assessment.evidence.standing).toBe("measured");
    expect(assessment.evidence.audits).toContainEqual(
      expect.objectContaining({ kpiKey: "attendance.rate", admission: "admitted", age: 0 }),
    );
    expect(assessment.evidence.audits).toContainEqual(
      expect.objectContaining({ kpiKey: "finance.days", age: 1 }),
    );
  });
});

describe("rule — an assessment carries everything needed to produce it again", () => {
  it("pins the declared weighting rather than the id of somewhere to look it up", () => {
    expect(assess().run.weights).toEqual(WEIGHTS);
  });

  it("pins what every pillar reported, coverage counts included", () => {
    expect(assess().run.inputs).toEqual(FULL);
  });

  it("detaches the pinned inputs from the array the caller passed", () => {
    const mutable: PillarInput[] = [...FULL];
    const assessment = assessHealthIndex(definition(), params({ inputs: mutable }));

    mutable.length = 0;

    expect(assessment.run.inputs).toHaveLength(FULL.length);
  });

  it("fingerprints the pinned run", () => {
    const assessment = assess();

    expect(assessment.fingerprint).toHaveLength(16);
    expect(assess().fingerprint).toBe(assessment.fingerprint);
  });

  it("reproduces itself exactly from its own record", () => {
    const verdict = reproduceAssessment(assess());

    expect(verdict.reproduced).toBe(true);
    expect(verdict.inputsMatch).toBe(true);
    expect(verdict.faults).toEqual([]);
    expect(verdict.drift).toBe(0);
  });

  it("reports every way a re-run against later inputs disagreed, not just the first", () => {
    const assessment = assess();
    const verdict = reproduceAssessment(assessment, {
      weights: assessment.run.weights,
      inputs: inputs([
        ["academic_outcomes", 60],
        ["teaching_quality", 70],
        ["attendance_engagement", 90],
        ["financial_health", 60],
        ["learner_wellbeing", 50],
        ["workforce_capacity", 40],
      ]),
    });

    expect(verdict.faults).toEqual(["inputs_changed", "value_drift", "band_drift"]);
    expect(verdict.recordedValue).toBe(70);
    expect(verdict.recomputedValue).toBe(65);
    expect(verdict.drift).toBe(-5);
  });

  it("notices a reweighting even where the composite happens to land in the same band", () => {
    const assessment = assess();
    const verdict = reproduceAssessment(assessment, {
      weights: [
        { pillar: "academic_outcomes", weight: 0.3 },
        { pillar: "teaching_quality", weight: 0.2 },
        { pillar: "attendance_engagement", weight: 0.15 },
        { pillar: "financial_health", weight: 0.15 },
        { pillar: "learner_wellbeing", weight: 0.1 },
        { pillar: "workforce_capacity", weight: 0.1 },
      ],
      inputs: assessment.run.inputs,
    });

    expect(verdict.inputsMatch).toBe(false);
    expect(verdict.faults).toContain("inputs_changed");
  });

  it("says a pillar dropping out changed the coverage, not only the number", () => {
    const assessment = assess();
    const verdict = reproduceAssessment(assessment, {
      weights: assessment.run.weights,
      inputs: THIN,
    });

    expect(verdict.faults).toContain("coverage_drift");
  });
});

describe("standing behind a number", () => {
  it("records that the institution stands behind it, and when", () => {
    const assessment = finalized();

    expect(assessment.status).toBe("final");
    expect(assessment.finalizedAt).not.toBeNull();
    expect(isAssessmentFinal(assessment)).toBe(true);
  });

  it("keeps the moment it was computed", () => {
    const assessment = assess();

    expect(finalizeAssessment(assessment).createdAt).toBe(assessment.createdAt);
  });

  it("leaves the assessment it was handed provisional", () => {
    const assessment = assess();
    finalizeAssessment(assessment);

    expect(assessment.status).toBe("provisional");
  });

  it("refuses a second finalization", () => {
    let thrown: unknown;
    try {
      finalizeAssessment(finalized());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AssessmentNotProvisionalError);
    expect((thrown as AssessmentNotProvisionalError).details).toMatchObject({ status: "final" });
    expect((thrown as AssessmentNotProvisionalError).httpStatus).toBe(409);
  });

  it("refuses to finalize a withdrawn assessment", () => {
    let thrown: unknown;
    try {
      finalizeAssessment(invalidated());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AssessmentNotProvisionalError);
    expect((thrown as AssessmentNotProvisionalError).details).toMatchObject({
      status: "invalidated",
    });
  });

  it("refuses a figure nothing can be followed back from, however wide its coverage", () => {
    let thrown: unknown;
    try {
      finalizeAssessment(assess({ readings: [untraceable("attendance.rate", 7)] }));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UngroundedAssessmentError);
    expect((thrown as UngroundedAssessmentError).details).toEqual({ period: 7 });
    expect((thrown as UngroundedAssessmentError).httpStatus).toBe(422);
  });

  it("refuses a figure that saw too little of the institution", () => {
    let thrown: unknown;
    try {
      finalizeAssessment(assess({ inputs: THIN }));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InsufficientAssessmentCoverageError);
    expect((thrown as InsufficientAssessmentCoverageError).details).toEqual({
      period: 7,
      pillarCoverage: 0.5,
    });
    expect((thrown as InsufficientAssessmentCoverageError).httpStatus).toBe(409);
  });

  it("reports the missing evidence before the missing coverage when both are wrong", () => {
    let thrown: unknown;
    try {
      finalizeAssessment(assess({ inputs: THIN, readings: [untraceable("attendance.rate", 7)] }));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UngroundedAssessmentError);
  });

  it("refuses a composite that could not be computed at all", () => {
    let thrown: unknown;
    try {
      finalizeAssessment(assess({ inputs: [] }));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InsufficientAssessmentCoverageError);
  });

  it("offers finalization exactly when finalization would succeed", () => {
    const candidates = [
      assess(),
      assess({ inputs: THIN }),
      assess({ readings: [untraceable("attendance.rate", 7)] }),
      assess({ inputs: [] }),
      finalized(),
      invalidated(),
    ];

    for (const candidate of candidates) {
      expect(isAssessmentFinalizable(candidate)).toBe(finalizes(candidate));
    }
  });
});

describe("withdrawing a number", () => {
  it("says when and why, and leaves the figure where it is", () => {
    const assessment = invalidated();

    expect(assessment.status).toBe("invalidated");
    expect(assessment.invalidatedAt).not.toBeNull();
    expect(assessment.invalidationReason).toBe("Feed was double-counting");
    expect(assessment.value).toBe(70);
    expect(isAssessmentInvalidated(assessment)).toBe(true);
  });

  it("withdraws a figure that was already quoted, which is the case it exists for", () => {
    const assessment = invalidateAssessment(finalized(), "Pinned readings were withdrawn");

    expect(assessment.status).toBe("invalidated");
    expect(assessment.finalizedAt).not.toBeNull();
  });

  it("reads a blank reason as none rather than storing whitespace", () => {
    expect(invalidateAssessment(assess(), "   ").invalidationReason).toBeNull();
    expect(invalidateAssessment(assess()).invalidationReason).toBeNull();
  });

  it("refuses a second withdrawal, which would move the moment a retraction traced to", () => {
    let thrown: unknown;
    try {
      invalidateAssessment(invalidated(), "again");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AssessmentAlreadyInvalidatedError);
    expect((thrown as AssessmentAlreadyInvalidatedError).httpStatus).toBe(409);
  });

  it("reaches every status the vocabulary declares", () => {
    const reached = [assess(), finalized(), invalidated()].map((assessment) => assessment.status);

    expect(new Set(reached)).toEqual(new Set(ASSESSMENT_STATUSES));
  });
});

describe("what an assessment shows the rest of the contract", () => {
  it("puts the stored result back into the shape the engines read", () => {
    const assessment = assess();

    expect(toIndexVerdict(assessment)).toEqual({
      value: 70,
      band: "healthy",
      pillarCoverage: 1,
      sufficient: true,
      contributions: assessment.contributions,
      omissions: [],
      weightRedistributed: 0,
    });
  });

  it("ranks its pillars by what each is costing the composite, ties falling to declaration order", () => {
    const ranked = rankByDrag(toIndexVerdict(assess()));

    expect(ranked.map((entry) => entry.pillar)).toEqual([
      "teaching_quality",
      "financial_health",
      "workforce_capacity",
      "academic_outcomes",
      "learner_wellbeing",
      "attendance_engagement",
    ]);
  });

  it("sends attention after the pillar costing the most, not the one scoring the worst", () => {
    const assessment = assess({
      inputs: inputs([
        ["academic_outcomes", 50],
        ["teaching_quality", 100],
        ["attendance_engagement", 100],
        ["financial_health", 100],
        ["learner_wellbeing", 100],
        ["workforce_capacity", 0],
      ]),
    });
    const ranked = rankByDrag(toIndexVerdict(assessment));

    expect(ranked.map((entry) => entry.pillar).slice(0, 2)).toEqual([
      "academic_outcomes",
      "workforce_capacity",
    ]);
  });

  it("agrees with the engine about whether it may be quoted", () => {
    expect(isCitable(toIndexVerdict(assess()))).toBe(true);
    expect(isCitable(toIndexVerdict(assess({ inputs: THIN })))).toBe(false);
  });

  it("offers the four facts a reproduction has to land on again", () => {
    const assessment = assess();

    expect(toRecordedIndex(assessment)).toEqual({
      value: 70,
      band: "healthy",
      pillarCoverage: 1,
      fingerprint: assessment.fingerprint,
    });
  });

  it("gives what one pillar contributed", () => {
    const contribution = pillarContributionIn(assess(), "financial_health");

    expect(contribution).toMatchObject({
      pillar: "financial_health",
      score: 60,
      declaredWeight: 0.15,
    });
  });

  it("gives nothing for a pillar that dropped out, and nothing for one never declared", () => {
    const assessment = assess({ inputs: THIN });

    expect(pillarContributionIn(assessment, "financial_health")).toBeNull();
    expect(pillarContributionIn(assessment, "governance_compliance")).toBeNull();
  });

  it("watches the institution against the period before it", () => {
    const previous = assess({ inputs: THIN });
    const watch = toIndexWatch(assess(), previous);

    expect(watch).toEqual({
      value: 70,
      pillarCoverage: 1,
      previousValue: previous.value,
      previousPillarCoverage: 0.5,
      standing: "measured",
      previousStanding: "measured",
    });
  });

  it("says nothing came before rather than implying coverage held steady", () => {
    const watch = toIndexWatch(assess(), null);

    expect(watch.previousValue).toBeNull();
    expect(watch.previousPillarCoverage).toBe(0);
    expect(watch.previousStanding).toBeNull();
  });

  it("watches one pillar with the periods behind it, oldest first and excluding this one", () => {
    const history = [
      assess({ inputs: inputs([["financial_health", 40]]) }),
      assess({ inputs: inputs([["financial_health", 50]]) }),
      assess({ inputs: inputs([["financial_health", 55]]) }),
    ];
    const watch = toPillarWatch(assess(), "financial_health", history);

    expect(watch).toEqual({
      pillar: "financial_health",
      score: 60,
      history: [40, 50, 55],
      kpiCoverage: 0.8,
    });
  });

  it("stops at the first period the pillar did not report, rather than splicing across the gap", () => {
    const history = [
      assess({ inputs: inputs([["financial_health", 90]]) }),
      assess({ inputs: THIN }),
      assess({ inputs: inputs([["financial_health", 55]]) }),
    ];

    expect(toPillarWatch(assess(), "financial_health", history).history).toEqual([55]);
  });

  it("takes no history at all when the most recent period did not report the pillar", () => {
    const history = [
      assess({ inputs: inputs([["financial_health", 90]]) }),
      assess({ inputs: THIN }),
    ];

    expect(toPillarWatch(assess(), "financial_health", history).history).toEqual([]);
  });

  it("shows how much of a dropped pillar was measured, so the hole reads as a hole", () => {
    const watch = toPillarWatch(assess({ inputs: THIN }), "financial_health", []);

    expect(watch.score).toBeNull();
    expect(watch.kpiCoverage).toBe(0);
  });

  it("shows nothing measured for a pillar the composition never declared", () => {
    const watch = toPillarWatch(assess(), "governance_compliance", []);

    expect(watch.score).toBeNull();
    expect(watch.kpiCoverage).toBe(0);
  });
});
