import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  BenefitAlreadyObservedError,
  BenefitNotClaimedError,
  EmptyMeasureKeyError,
  IncoherentBenefitClaimError,
  InvalidMeasureKeyError,
  InvalidReviewPeriodError,
  RepeatBenefitClaimError,
  ReviewConcludedError,
  UnmeasurableObservationError,
} from "./errors";
import { MAX_PERIOD, REALIZATION_VERDICTS, VARIANCE_FLOORS } from "./evolution-value";
import {
  type AdoptionReview,
  type OpenReviewParams,
  type RecordBenefitParams,
  concludeReview,
  isReviewConcluded,
  observeBenefit,
  openReview,
  recordBenefit,
  reviewRecommendation,
  reviewUnobservedMeasures,
} from "./adoption-review";
import * as reviewModule from "./adoption-review";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;
const OPENER = "person-1" as Uuid;
const ACTOR = "person-9" as Uuid;
const INITIATIVE = "initiative-1" as Uuid;

/** The fixture benefit: a measure standing at 60 that the change promised to lift to 80. */
const MEASURE = "attendance.persistent-absence-followup";
const BASELINE = 60;
const TARGET = 80;
const PROMISED = TARGET - BASELINE;

/** A fraction of the promise that lands below the shortfall floor, and so in the band with no floor. */
const MISSED = VARIANCE_FLOORS.shortfall - 0.01;

const opening = (overrides: Partial<OpenReviewParams> = {}): OpenReviewParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  initiativeId: INITIATIVE,
  reviewPeriod: 3,
  openedBy: OPENER,
  ...overrides,
});

const open = (overrides: Partial<OpenReviewParams> = {}): AdoptionReview =>
  openReview(opening(overrides));

const claim = (overrides: Partial<RecordBenefitParams> = {}): RecordBenefitParams => ({
  measureKey: MEASURE,
  direction: "increase",
  baseline: BASELINE,
  target: TARGET,
  ...overrides,
});

/** A review holding one claimed benefit that nobody has looked at yet. */
const claimed = (overrides: Partial<RecordBenefitParams> = {}): AdoptionReview =>
  recordBenefit(open(), claim(overrides));

/** The observation that lands the fixture benefit at a given fraction of what it promised. */
const landing = (ratio: number): number => BASELINE + PROMISED * ratio;

/** A review holding one benefit observed at a given fraction of its promise. */
const observed = (ratio: number): AdoptionReview =>
  observeBenefit(claimed(), MEASURE, landing(ratio));

const bandAt = (ratio: number): string | null => observed(ratio).benefits[0]?.band ?? null;

/**
 * A review holding one benefit per entry, observed at that fraction of its promise — or left unobserved by
 * passing `null`, which is how the claimed-against-measured counts are exercised.
 */
const across = (...ratios: readonly (number | null)[]): AdoptionReview =>
  ratios.reduce<AdoptionReview>((review, ratio, index) => {
    const measureKey = `${MEASURE}-${index}`;
    const withClaim = recordBenefit(review, claim({ measureKey }));
    return ratio === null ? withClaim : observeBenefit(withClaim, measureKey, landing(ratio));
  }, open());

const claimIssues = (overrides: Partial<RecordBenefitParams>): readonly string[] => {
  let thrown: IncoherentBenefitClaimError | null = null;
  try {
    recordBenefit(open(), claim(overrides));
  } catch (error) {
    thrown = error as IncoherentBenefitClaimError;
  }
  expect(thrown).toBeInstanceOf(IncoherentBenefitClaimError);
  return (thrown?.details as { issues: readonly string[] } | undefined)?.issues ?? [];
};

describe("openReview", () => {
  it("opens against an adopted change with nothing claimed and nothing concluded", () => {
    const review = open();
    expect(review.initiativeId).toBe(INITIATIVE);
    expect(review.reviewPeriod).toBe(3);
    expect(review.benefits).toEqual([]);
    expect(review.openedBy).toBe(OPENER);
    expect(review.concludedAt).toBeNull();
    expect(review.concludedBy).toBeNull();
  });

  it("opens inconclusive, because a review that has measured nothing has shown nothing", () => {
    const review = open();
    expect(review.verdict).toBe("inconclusive");
    expect(review.worstBand).toBeNull();
    expect(review.benefitsClaimed).toBe(0);
    expect(review.benefitsMeasured).toBe(0);
  });

  it("accepts both ends of the period grid", () => {
    expect(open({ reviewPeriod: 0 }).reviewPeriod).toBe(0);
    expect(open({ reviewPeriod: MAX_PERIOD }).reviewPeriod).toBe(MAX_PERIOD);
  });

  it("refuses a period that is not an index into the caller's grid", () => {
    let thrown: InvalidReviewPeriodError | null = null;
    try {
      open({ reviewPeriod: -1 });
    } catch (error) {
      thrown = error as InvalidReviewPeriodError;
    }
    expect(thrown).toBeInstanceOf(InvalidReviewPeriodError);
    expect(thrown?.details).toMatchObject({ period: -1 });
    expect(() => open({ reviewPeriod: 2.5 })).toThrow(InvalidReviewPeriodError);
    expect(() => open({ reviewPeriod: MAX_PERIOD + 1 })).toThrow(InvalidReviewPeriodError);
  });
});

describe("recordBenefit", () => {
  it("records what the change promised, with the space for the observation left empty", () => {
    const benefit = claimed().benefits[0];
    expect(benefit?.measureKey).toBe(MEASURE);
    expect(benefit?.direction).toBe("increase");
    expect(benefit?.baseline).toBe(BASELINE);
    expect(benefit?.target).toBe(TARGET);
    expect(benefit?.observed).toBeNull();
  });

  it("knows how much movement was promised before anybody has looked", () => {
    const benefit = claimed().benefits[0];
    expect(benefit?.promised).toBe(PROMISED);
    expect(benefit?.achieved).toBe(0);
    expect(benefit?.ratio).toBe(0);
    expect(benefit?.band).toBeNull();
  });

  it("leaves the review inconclusive: a claim is a promise, not a measurement", () => {
    const review = claimed();
    expect(review.verdict).toBe("inconclusive");
    expect(review.benefitsClaimed).toBe(1);
    expect(review.benefitsMeasured).toBe(0);
  });

  it("normalizes the key, so the observation months later files against the claim", () => {
    const review = claimed({ measureKey: "  Attendance.Persistent-Absence  " });
    expect(review.benefits[0]?.measureKey).toBe("attendance.persistent-absence");
  });

  it("refuses a benefit with no name", () => {
    expect(() => claimed({ measureKey: "   " })).toThrow(EmptyMeasureKeyError);
  });

  it("refuses a key the observation could never be matched to", () => {
    let thrown: InvalidMeasureKeyError | null = null;
    try {
      claimed({ measureKey: "Absence Rate!" });
    } catch (error) {
      thrown = error as InvalidMeasureKeyError;
    }
    expect(thrown).toBeInstanceOf(InvalidMeasureKeyError);
    expect(thrown?.details).toMatchObject({ measureKey: "absence rate!" });
  });

  it("refuses the same measure claimed twice", () => {
    const review = claimed();
    let thrown: RepeatBenefitClaimError | null = null;
    try {
      recordBenefit(review, claim({ target: 90 }));
    } catch (error) {
      thrown = error as RepeatBenefitClaimError;
    }
    expect(thrown).toBeInstanceOf(RepeatBenefitClaimError);
    expect(thrown?.details).toMatchObject({ id: review.id, measureKey: MEASURE });
  });

  it("refuses a target identical to its baseline: a promise nothing could fall short of", () => {
    expect(claimIssues({ target: BASELINE })).toEqual(["no_promised_movement"]);
  });

  it("refuses a target on the wrong side of its own baseline rather than inferring the direction", () => {
    expect(claimIssues({ target: 50 })).toEqual(["target_contradicts_direction"]);
    expect(claimIssues({ direction: "decrease", target: 90 })).toEqual([
      "target_contradicts_direction",
    ]);
  });

  it("refuses a claim built on numbers arithmetic cannot be trusted with", () => {
    expect(claimIssues({ baseline: Number.NaN })).toEqual(["invalid_baseline"]);
    expect(claimIssues({ target: Number.POSITIVE_INFINITY })).toEqual(["invalid_target"]);
  });

  it("reports no fault about the observation, which nobody has been asked for yet", () => {
    expect(claimIssues({ baseline: Number.NaN })).not.toContain("invalid_observed");
  });

  it("holds several benefits at once, because a change is rarely defended on one number", () => {
    const review = across(null, null, null);
    expect(review.benefits).toHaveLength(3);
    expect(review.benefitsClaimed).toBe(3);
  });

  it("refuses a claim once the review has concluded", () => {
    const review = concludeReview(claimed(), ACTOR);
    let thrown: ReviewConcludedError | null = null;
    try {
      recordBenefit(review, claim({ measureKey: "attendance.late-arrivals" }));
    } catch (error) {
      thrown = error as ReviewConcludedError;
    }
    expect(thrown).toBeInstanceOf(ReviewConcludedError);
    expect(thrown?.details).toMatchObject({ id: review.id });
  });
});

describe("observeBenefit", () => {
  it("lands the observation and the movement it represents", () => {
    const benefit = observed(VARIANCE_FLOORS.met).benefits[0];
    expect(benefit?.observed).toBe(78);
    expect(benefit?.promised).toBe(PROMISED);
    expect(benefit?.achieved).toBe(18);
    expect(benefit?.ratio).toBe(VARIANCE_FLOORS.met);
  });

  it("bands the result against the floors the vocabulary declares", () => {
    expect(bandAt(VARIANCE_FLOORS.exceeded)).toBe("exceeded");
    expect(bandAt(VARIANCE_FLOORS.met)).toBe("met");
    expect(bandAt(VARIANCE_FLOORS.shortfall)).toBe("shortfall");
    expect(bandAt(MISSED)).toBe("missed");
  });

  it("puts each floor's near miss in the band below it", () => {
    expect(bandAt(VARIANCE_FLOORS.exceeded - 0.01)).toBe("met");
    expect(bandAt(VARIANCE_FLOORS.met - 0.01)).toBe("shortfall");
  });

  it("bands on movement rather than level: one observation, two promises, two verdicts", () => {
    const ambitious = observeBenefit(claimed(), MEASURE, 76);
    const modest = observeBenefit(claimed({ baseline: 74 }), MEASURE, 76);
    expect(ambitious.benefits[0]?.ratio).toBe(0.8);
    expect(ambitious.benefits[0]?.band).toBe("shortfall");
    expect(modest.benefits[0]?.ratio).toBe(0.33);
    expect(modest.benefits[0]?.band).toBe("missed");
  });

  it("measures a benefit that was supposed to come down exactly like one that was supposed to go up", () => {
    const falling = recordBenefit(
      open(),
      claim({ direction: "decrease", baseline: 30, target: 10 }),
    );
    const worked = observeBenefit(falling, MEASURE, 12);
    expect(worked.benefits[0]?.promised).toBe(20);
    expect(worked.benefits[0]?.achieved).toBe(18);
    expect(worked.benefits[0]?.band).toBe("met");
  });

  it("reports movement in the wrong direction as negative rather than as no movement", () => {
    const falling = recordBenefit(
      open(),
      claim({ direction: "decrease", baseline: 30, target: 10 }),
    );
    const backwards = observeBenefit(falling, MEASURE, 34);
    expect(backwards.benefits[0]?.achieved).toBe(-4);
    expect(backwards.benefits[0]?.band).toBe("missed");
  });

  it("normalizes the key on the way in, as the claim did", () => {
    const review = observeBenefit(claimed(), `  ${MEASURE.toUpperCase()}  `, 78);
    expect(review.benefits[0]?.observed).toBe(78);
  });

  it("refuses an observation for a measure nobody claimed", () => {
    const review = claimed();
    let thrown: BenefitNotClaimedError | null = null;
    try {
      observeBenefit(review, "attendance.late-arrivals", 78);
    } catch (error) {
      thrown = error as BenefitNotClaimedError;
    }
    expect(thrown).toBeInstanceOf(BenefitNotClaimedError);
    expect(thrown?.details).toMatchObject({
      id: review.id,
      measureKey: "attendance.late-arrivals",
    });
  });

  it("refuses a second observation: measuring again in a better quarter is a later review", () => {
    const review = observed(MISSED);
    let thrown: BenefitAlreadyObservedError | null = null;
    try {
      observeBenefit(review, MEASURE, landing(VARIANCE_FLOORS.exceeded));
    } catch (error) {
      thrown = error as BenefitAlreadyObservedError;
    }
    expect(thrown).toBeInstanceOf(BenefitAlreadyObservedError);
    expect(thrown?.details).toMatchObject({ id: review.id, measureKey: MEASURE });
    expect(review.benefits[0]?.band).toBe("missed");
  });

  it("refuses an unusable observation rather than storing a benefit that looks measured", () => {
    let thrown: UnmeasurableObservationError | null = null;
    try {
      observeBenefit(claimed(), MEASURE, Number.NaN);
    } catch (error) {
      thrown = error as UnmeasurableObservationError;
    }
    expect(thrown).toBeInstanceOf(UnmeasurableObservationError);
    expect(thrown?.details).toMatchObject({ measureKey: MEASURE, issues: ["invalid_observed"] });
    expect(() => observeBenefit(claimed(), MEASURE, Number.POSITIVE_INFINITY)).toThrow(
      UnmeasurableObservationError,
    );
  });

  it("refuses an observation once the review has concluded", () => {
    const review = concludeReview(claimed(), ACTOR);
    expect(() => observeBenefit(review, MEASURE, 78)).toThrow(ReviewConcludedError);
  });
});

describe("the verdict", () => {
  it("sustains a change whose benefits all landed at or above what was promised", () => {
    const review = across(VARIANCE_FLOORS.exceeded, VARIANCE_FLOORS.met);
    expect(review.verdict).toBe("sustained");
    expect(review.worstBand).toBe("met");
  });

  it("recommends adjusting when something fell short", () => {
    const review = across(VARIANCE_FLOORS.exceeded, VARIANCE_FLOORS.shortfall);
    expect(review.verdict).toBe("adjust");
    expect(review.worstBand).toBe("shortfall");
  });

  it("recommends reverting when something was missed", () => {
    const review = across(VARIANCE_FLOORS.met, MISSED);
    expect(review.verdict).toBe("revert");
    expect(review.worstBand).toBe("missed");
  });

  it("lets the severest finding decide rather than the average, so three good ones cannot outvote it", () => {
    const review = across(
      VARIANCE_FLOORS.exceeded,
      VARIANCE_FLOORS.exceeded,
      VARIANCE_FLOORS.exceeded,
      MISSED,
    );
    expect(review.benefitsMeasured).toBe(4);
    expect(review.verdict).toBe("revert");
  });

  it("stays inconclusive while every claim is still unobserved", () => {
    const review = across(null, null);
    expect(review.verdict).toBe("inconclusive");
    expect(review.worstBand).toBeNull();
    expect(review.benefitsClaimed).toBe(2);
    expect(review.benefitsMeasured).toBe(0);
  });

  it("says how much of its own case a verdict rests on", () => {
    const review = across(VARIANCE_FLOORS.exceeded, null, null);
    expect(review.verdict).toBe("sustained");
    expect(review.benefitsClaimed).toBe(3);
    expect(review.benefitsMeasured).toBe(1);
  });

  it("re-derives the whole standing from the stored benefits each time one changes", () => {
    const claimedTwice = across(null, null);
    const half = observeBenefit(claimedTwice, `${MEASURE}-0`, landing(MISSED));
    const both = observeBenefit(half, `${MEASURE}-1`, landing(VARIANCE_FLOORS.exceeded));
    expect(half.verdict).toBe("revert");
    expect(both.verdict).toBe("revert");
    expect(both.benefitsMeasured).toBe(2);
  });
});

describe("concludeReview", () => {
  it("stamps who settled the verdict and when", () => {
    const review = concludeReview(observed(VARIANCE_FLOORS.met), ACTOR);
    expect(review.concludedBy).toBe(ACTOR);
    expect(review.concludedAt).not.toBeNull();
    expect(review.verdict).toBe("sustained");
  });

  it("concludes a review that could measure nothing, because that is a finding too", () => {
    const review = concludeReview(across(null, null), ACTOR);
    expect(review.verdict).toBe("inconclusive");
    expect(isReviewConcluded(review)).toBe(true);
  });

  it("refuses to conclude twice", () => {
    const review = concludeReview(observed(VARIANCE_FLOORS.met), ACTOR);
    let thrown: ReviewConcludedError | null = null;
    try {
      concludeReview(review, OPENER);
    } catch (error) {
      thrown = error as ReviewConcludedError;
    }
    expect(thrown).toBeInstanceOf(ReviewConcludedError);
    expect(thrown?.details).toMatchObject({ id: review.id });
  });
});

describe("reading a review", () => {
  it("says whether the verdict is settled", () => {
    expect(isReviewConcluded(claimed())).toBe(false);
    expect(isReviewConcluded(concludeReview(claimed(), ACTOR))).toBe(true);
  });

  it("agrees with the columns it stored, which is what makes storing them safe", () => {
    const review = across(VARIANCE_FLOORS.exceeded, MISSED, null);
    expect(reviewRecommendation(review)).toEqual({
      verdict: review.verdict,
      worstBand: review.worstBand,
      benefitsMeasured: review.benefitsMeasured,
      benefitsClaimed: review.benefitsClaimed,
    });
  });

  it("shows what concluding now would say, before anybody concludes", () => {
    expect(reviewRecommendation(open()).verdict).toBe("inconclusive");
    expect(reviewRecommendation(observed(VARIANCE_FLOORS.shortfall)).verdict).toBe("adjust");
  });

  it("names the measures nobody has looked at, not just how many", () => {
    const review = across(VARIANCE_FLOORS.met, null, null);
    expect(reviewUnobservedMeasures(review)).toEqual([`${MEASURE}-1`, `${MEASURE}-2`]);
    expect(reviewUnobservedMeasures(observed(VARIANCE_FLOORS.met))).toEqual([]);
  });
});

describe("deliberate absences", () => {
  it("publishes exactly the surface a review has and nothing more", () => {
    expect(Object.keys(reviewModule).sort()).toEqual([
      "concludeReview",
      "isReviewConcluded",
      "observeBenefit",
      "openReview",
      "recordBenefit",
      "reviewRecommendation",
      "reviewUnobservedMeasures",
    ]);
  });

  it("offers nothing that would act on its own verdict", () => {
    const names = Object.keys(reviewModule).join(" ").toLowerCase();
    for (const forbidden of ["revert", "undo", "rollback", "reverse", "apply"]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it("offers no way to restate an observation once it has been made", () => {
    const names = Object.keys(reviewModule).join(" ").toLowerCase();
    for (const forbidden of ["replace", "amend", "correct", "reobserve", "delete"]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it("mutates nothing it was given", () => {
    const review = claimed();
    const before = JSON.stringify(review);
    observeBenefit(review, MEASURE, landing(VARIANCE_FLOORS.exceeded));
    concludeReview(review, ACTOR);
    expect(JSON.stringify(review)).toBe(before);
  });

  it("moves the updated stamp on every change and never the created one", () => {
    const review = claimed();
    const moved = observeBenefit(review, MEASURE, landing(VARIANCE_FLOORS.met));
    expect(moved.createdAt).toBe(review.createdAt);
    expect(moved.id).toBe(review.id);
    expect(moved.initiativeId).toBe(review.initiativeId);
    expect(moved.openedAt).toBe(review.openedAt);
  });

  it("reaches no verdict outside the four the vocabulary declares", () => {
    const verdicts = [
      open().verdict,
      observed(VARIANCE_FLOORS.met).verdict,
      observed(VARIANCE_FLOORS.shortfall).verdict,
      observed(MISSED).verdict,
    ];
    for (const verdict of verdicts) expect(REALIZATION_VERDICTS).toContain(verdict);
    expect(new Set(verdicts).size).toBe(REALIZATION_VERDICTS.length);
  });
});
