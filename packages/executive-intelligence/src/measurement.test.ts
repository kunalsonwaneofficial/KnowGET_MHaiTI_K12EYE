import { describe, expect, it } from "vitest";
import {
  BAND_FLOORS,
  MAX_NORMALIZED_SCORE,
  MIN_NORMALIZED_SCORE,
  isWorseBand,
} from "./command-value";
import type { MeasurementScale, ScoreAnchor } from "./command-view";
import {
  MIN_SCALE_ANCHORS,
  SCALE_ISSUE_CODES,
  type ScaleIssueCode,
  clampOutcomeFor,
  measure,
  normalizeMeasure,
  validateScale,
} from "./measurement";

const anchors = (...pairs: readonly (readonly [number, number])[]): readonly ScoreAnchor[] =>
  pairs.map(([value, score]) => ({ value, score }));

/** Attendance percentage: 85 is failing, 96 is exemplary. */
const attendance: MeasurementScale = {
  unit: "percentage",
  polarity: "higher_is_better",
  anchors: anchors([85, 0], [90, 50], [93, 70], [96, 100]),
};

/** Chronic absence rate: fewer is better. */
const chronicAbsence: MeasurementScale = {
  unit: "percentage",
  polarity: "lower_is_better",
  anchors: anchors([2, 100], [5, 70], [10, 40], [20, 0]),
};

/** Class size: both directions are failures. */
const classSize: MeasurementScale = {
  unit: "count",
  polarity: "on_target",
  anchors: anchors([10, 20], [18, 80], [24, 100], [30, 60], [40, 0]),
};

const codesOf = (scale: MeasurementScale): readonly string[] =>
  validateScale(scale).issues.map((entry) => entry.code);

describe("validateScale", () => {
  it("accepts a well-formed ascending scale", () => {
    expect(validateScale(attendance)).toEqual({ usable: true, issues: [] });
  });

  it("accepts a well-formed descending scale", () => {
    expect(validateScale(chronicAbsence).usable).toBe(true);
  });

  it("accepts a rise-then-fall scale for a two-sided indicator", () => {
    expect(validateScale(classSize).usable).toBe(true);
  });

  it("declares every issue code it can emit", () => {
    expect(new Set(SCALE_ISSUE_CODES).size).toBe(SCALE_ISSUE_CODES.length);
  });

  it("refuses a scale with too few anchors to interpolate between", () => {
    expect(MIN_SCALE_ANCHORS).toBe(2);
    expect(codesOf({ ...attendance, anchors: anchors([90, 100]) })).toContain("too_few_anchors");
    expect(codesOf({ ...attendance, anchors: [] })).toContain("too_few_anchors");
  });

  it("refuses anchors out of ascending order and names the offending index", () => {
    const verdict = validateScale({
      ...attendance,
      anchors: anchors([85, 0], [93, 70], [90, 50], [96, 100]),
    });
    expect(verdict.usable).toBe(false);
    expect(verdict.issues).toContainEqual({ code: "unsorted_anchors", anchorIndex: 2 });
  });

  it("refuses a repeated raw value, distinctly from an out-of-order one", () => {
    const verdict = validateScale({
      ...attendance,
      anchors: anchors([85, 0], [90, 50], [90, 70], [96, 100]),
    });
    expect(verdict.issues).toContainEqual({ code: "duplicate_anchor_value", anchorIndex: 2 });
    expect(
      codesOf({ ...attendance, anchors: anchors([85, 0], [90, 50], [90, 70], [96, 100]) }),
    ).not.toContain("unsorted_anchors");
  });

  it("refuses an anchor value inadmissible in the declared unit", () => {
    const verdict = validateScale({
      ...attendance,
      anchors: anchors([85, 0], [140, 100]),
    });
    expect(verdict.issues).toContainEqual({ code: "inadmissible_anchor_value", anchorIndex: 1 });
  });

  it("refuses a fractional anchor on a counted unit", () => {
    const verdict = validateScale({
      ...classSize,
      anchors: anchors([10.5, 20], [24, 100], [40, 0]),
    });
    expect(verdict.issues).toContainEqual({ code: "inadmissible_anchor_value", anchorIndex: 0 });
  });

  it("refuses a score off the normalized scale", () => {
    const verdict = validateScale({ ...attendance, anchors: anchors([85, 0], [96, 120]) });
    expect(verdict.issues).toContainEqual({ code: "score_out_of_range", anchorIndex: 1 });
  });

  it("refuses a scale that scores everything the same", () => {
    expect(codesOf({ ...attendance, anchors: anchors([85, 70], [90, 70], [96, 70]) })).toEqual([
      "flat_scale",
    ]);
  });

  it("refuses scores running the wrong way for the declared polarity", () => {
    expect(codesOf({ ...attendance, anchors: anchors([85, 100], [96, 0]) })).toContain(
      "wrong_direction",
    );
    expect(codesOf({ ...chronicAbsence, anchors: anchors([2, 0], [20, 100]) })).toContain(
      "wrong_direction",
    );
  });

  it("permits a plateau inside a one-sided scale", () => {
    expect(
      validateScale({ ...attendance, anchors: anchors([85, 0], [90, 70], [93, 70], [96, 100]) })
        .usable,
    ).toBe(true);
  });

  it("permits a plateau at the peak of a two-sided scale", () => {
    expect(
      validateScale({
        ...classSize,
        anchors: anchors([10, 20], [20, 100], [26, 100], [40, 0]),
      }).usable,
    ).toBe(true);
  });

  it("refuses a two-sided scale that never falls back", () => {
    expect(codesOf({ ...classSize, anchors: anchors([10, 20], [24, 60], [40, 100]) })).toContain(
      "target_not_interior",
    );
  });

  it("refuses a two-sided scale whose peak is at an end", () => {
    expect(codesOf({ ...classSize, anchors: anchors([10, 100], [24, 60], [40, 0]) })).toContain(
      "target_not_interior",
    );
  });

  it("refuses a two-sided scale that wanders instead of rising then falling", () => {
    expect(
      codesOf({
        ...classSize,
        anchors: anchors([10, 20], [18, 100], [24, 40], [30, 100], [40, 0]),
      }),
    ).toContain("target_peak_missing");
  });

  it("refuses a scale on which no institution could ever be healthy", () => {
    expect(
      codesOf({ ...attendance, anchors: anchors([85, 0], [96, BAND_FLOORS.healthy - 1]) }),
    ).toContain("unreachable_healthy_band");
  });

  it("accepts a scale that tops out exactly at the healthy floor", () => {
    expect(
      validateScale({ ...attendance, anchors: anchors([85, 0], [96, BAND_FLOORS.healthy]) }).usable,
    ).toBe(true);
  });

  it("reports every structural fault at once rather than one at a time", () => {
    const verdict = validateScale({
      ...attendance,
      anchors: anchors([85, 0], [140, 200], [120, 50]),
    });
    const codes = verdict.issues.map((entry) => entry.code);
    expect(codes).toContain("inadmissible_anchor_value");
    expect(codes).toContain("score_out_of_range");
    expect(codes).toContain("unsorted_anchors");
  });

  it("skips shape checks when the structure is broken, so authors chase the real fault", () => {
    const codes = codesOf({ ...attendance, anchors: anchors([96, 100], [85, 0]) });
    expect(codes).toContain("unsorted_anchors");
    expect(codes).not.toContain("wrong_direction");
    expect(codes).not.toContain("unreachable_healthy_band");
  });

  it("emits only codes it declared", () => {
    const declared = new Set<string>(SCALE_ISSUE_CODES);
    const broken: MeasurementScale[] = [
      { ...attendance, anchors: [] },
      { ...attendance, anchors: anchors([85, 100], [96, 0]) },
      { ...attendance, anchors: anchors([85, 70], [96, 70]) },
      { ...classSize, anchors: anchors([10, 100], [24, 60], [40, 0]) },
      { ...classSize, anchors: anchors([10, 20], [18, 100], [24, 40], [30, 100], [40, 0]) },
      { ...attendance, anchors: anchors([85, 0], [96, 40]) },
    ];
    for (const scale of broken) {
      for (const entry of validateScale(scale).issues) {
        expect(declared.has(entry.code as ScaleIssueCode)).toBe(true);
      }
    }
  });
});

describe("normalizeMeasure", () => {
  it("returns an anchor's own score at that anchor", () => {
    expect(normalizeMeasure(attendance, 85)).toBe(0);
    expect(normalizeMeasure(attendance, 90)).toBe(50);
    expect(normalizeMeasure(attendance, 93)).toBe(70);
    expect(normalizeMeasure(attendance, 96)).toBe(100);
  });

  it("interpolates linearly between two anchors", () => {
    expect(normalizeMeasure(attendance, 87.5)).toBe(25);
    expect(normalizeMeasure(attendance, 91.5)).toBe(60);
  });

  it("interpolates a descending scale the same way", () => {
    expect(normalizeMeasure(chronicAbsence, 3.5)).toBe(85);
    expect(normalizeMeasure(chronicAbsence, 15)).toBe(20);
  });

  it("interpolates both sides of a two-sided peak", () => {
    expect(normalizeMeasure(classSize, 21)).toBe(90);
    expect(normalizeMeasure(classSize, 27)).toBe(80);
    expect(normalizeMeasure(classSize, 24)).toBe(100);
  });

  it("clamps below the first anchor to its score", () => {
    expect(normalizeMeasure(attendance, 40)).toBe(0);
    expect(normalizeMeasure(chronicAbsence, 0)).toBe(100);
  });

  it("clamps above the last anchor to its score", () => {
    expect(normalizeMeasure(attendance, 99.9)).toBe(100);
    expect(normalizeMeasure(chronicAbsence, 60)).toBe(0);
  });

  it("never leaves the normalized scale", () => {
    for (let raw = 0; raw <= 100; raw += 0.5) {
      const score = normalizeMeasure(attendance, raw);
      expect(score).toBeGreaterThanOrEqual(MIN_NORMALIZED_SCORE);
      expect(score).toBeLessThanOrEqual(MAX_NORMALIZED_SCORE);
    }
  });

  it("is monotonic across a one-sided scale", () => {
    let previous = -1;
    for (let raw = 80; raw <= 100; raw += 0.25) {
      const score = normalizeMeasure(attendance, raw);
      expect(score).toBeGreaterThanOrEqual(previous);
      previous = score;
    }
  });

  it("rounds to the fixed precision, so two computations agree exactly", () => {
    const once = normalizeMeasure(attendance, 91.1234567891);
    expect(once).toBe(normalizeMeasure(attendance, 91.1234567891));
    expect(once.toString()).toBe(Number(once.toFixed(6)).toString());
  });

  it("scores a plateau flat across its whole span", () => {
    const plateau: MeasurementScale = {
      ...attendance,
      anchors: anchors([85, 0], [90, 70], [93, 70], [96, 100]),
    };
    expect(normalizeMeasure(plateau, 91)).toBe(70);
    expect(normalizeMeasure(plateau, 92)).toBe(70);
  });

  it("floors defensively on an empty scale rather than throwing", () => {
    expect(normalizeMeasure({ ...attendance, anchors: [] }, 90)).toBe(MIN_NORMALIZED_SCORE);
  });
});

describe("clampOutcomeFor", () => {
  it("reports no clamp inside the declared anchors", () => {
    expect(clampOutcomeFor(attendance, 91)).toBe("none");
    expect(clampOutcomeFor(attendance, 85)).toBe("none");
    expect(clampOutcomeFor(attendance, 96)).toBe("none");
  });

  it("reports a clamp at each end", () => {
    expect(clampOutcomeFor(attendance, 84.9)).toBe("below");
    expect(clampOutcomeFor(attendance, 96.1)).toBe("above");
  });

  it("reports in scale order, not in goodness order", () => {
    expect(clampOutcomeFor(chronicAbsence, 1)).toBe("below");
    expect(clampOutcomeFor(chronicAbsence, 30)).toBe("above");
  });

  it("reports no clamp on an empty scale rather than guessing", () => {
    expect(clampOutcomeFor({ ...attendance, anchors: [] }, 90)).toBe("none");
  });
});

describe("measure", () => {
  it("scores an admissible measure and bands it", () => {
    const result = measure(attendance, 93);
    expect(result).toEqual({
      scoreable: true,
      raw: 93,
      score: 70,
      band: "healthy",
      clamp: "none",
    });
  });

  it("carries the clamp alongside the score", () => {
    const result = measure(attendance, 99);
    expect(result.scoreable).toBe(true);
    if (result.scoreable) {
      expect(result.score).toBe(100);
      expect(result.clamp).toBe("above");
    }
  });

  it("refuses a value inadmissible in the KPI's own unit rather than scoring it low", () => {
    const result = measure(attendance, 140);
    expect(result).toEqual({ scoreable: false, raw: 140, reason: "inadmissible_value" });
  });

  it("refuses a fractional count", () => {
    expect(measure(classSize, 22.5)).toEqual({
      scoreable: false,
      raw: 22.5,
      reason: "inadmissible_value",
    });
  });

  it("refuses a non-finite measure", () => {
    expect(measure(attendance, Number.NaN).scoreable).toBe(false);
    expect(measure(attendance, Number.POSITIVE_INFINITY).scoreable).toBe(false);
  });

  it("refuses to score against a scale that does not validate", () => {
    const broken: MeasurementScale = { ...attendance, anchors: anchors([90, 100]) };
    expect(measure(broken, 90)).toEqual({ scoreable: false, raw: 90, reason: "unusable_scale" });
  });

  it("exposes no score to read on the refusal branch", () => {
    const result = measure(attendance, 140);
    expect("score" in result).toBe(false);
    expect("band" in result).toBe(false);
  });

  it("keeps the raw value on both branches, so a refusal is still a record", () => {
    expect(measure(attendance, 91).raw).toBe(91);
    expect(measure(attendance, 140).raw).toBe(140);
  });

  it("bands a two-sided indicator worse on both sides of its target", () => {
    const onTarget = measure(classSize, 24);
    const tooSmall = measure(classSize, 12);
    const tooLarge = measure(classSize, 38);
    expect(onTarget.scoreable && onTarget.band).toBe("exemplary");
    expect(tooSmall.scoreable && tooSmall.band).toBe("at_risk");
    expect(tooLarge.scoreable && tooLarge.band).toBe("failing");
    if (onTarget.scoreable && tooSmall.scoreable && tooLarge.scoreable) {
      expect(isWorseBand(tooSmall.band, onTarget.band)).toBe(true);
      expect(isWorseBand(tooLarge.band, onTarget.band)).toBe(true);
    }
  });

  it("bands a descending indicator by goodness, not by magnitude", () => {
    const low = measure(chronicAbsence, 2);
    const high = measure(chronicAbsence, 18);
    expect(low.scoreable && low.band).toBe("exemplary");
    expect(high.scoreable && high.band).toBe("failing");
  });

  it("gives the same answer twice for the same inputs", () => {
    expect(measure(attendance, 91.7)).toEqual(measure(attendance, 91.7));
  });
});
