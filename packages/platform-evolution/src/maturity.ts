import {
  CAPABILITY_AREA_COUNT,
  type CapabilityArea,
  LEVEL_FLOORS,
  MATURITY_LEVELS,
  MAX_AREA_WEIGHT,
  MIN_AREA_COVERAGE,
  MIN_AREA_WEIGHT,
  MIN_EVIDENCE_PER_AREA,
  MIN_MATURITY_SCORE,
  type MaturityLevel,
  WEIGHT_SUM,
  WEIGHT_TOLERANCE,
  clampMaturityScore,
  isCapabilityArea,
  isFiniteMeasure,
  normalizeKey,
  roundMaturity,
  roundWeight,
} from "./evolution-value";
import type {
  AreaOutcome,
  AreaReading,
  AreaWeight,
  MaturityIssue,
  MaturityVerdict,
  ResolvedWeight,
  WeightingIssue,
  WeightingVerdict,
} from "./evolution-view";

/**
 * The maturity engine: how well an institution is *able* to do the things it does, scored across the ten
 * capability areas, and how much of itself it actually looked at while deciding.
 *
 * A maturity score is the most quotable number this platform produces and therefore the easiest one to abuse.
 * The abuse is not usually fabrication; it is selection. An institution assesses the four areas where somebody
 * had evidence to hand, scores well on them, and publishes a headline that is perfectly true about four tenths
 * of itself. Nobody lied, and the number is still worthless — worse than worthless, because it will be compared
 * next year against a different four.
 *
 * Two mechanisms close that off and both are arithmetic rather than policy. Coverage is measured against all ten
 * capability areas and never against however many the institution chose to weight, so declining to assess an
 * area costs coverage exactly as much as assessing it badly. And an area only counts as having reported if it
 * cited evidence, so an assessor who types a five and points at nothing has moved neither the index nor the
 * coverage. Neither floor can be lowered from inside this package, because a floor a tenant can set is a floor
 * that gets set to whatever this term's assessment happens to reach.
 *
 * The engine still computes and still returns an under-covered assessment rather than refusing it. Refusing
 * would push the work back into the spreadsheet the platform exists to replace, and an institution part way
 * through its first assessment needs to see the shape of what it has. It simply is not `publishable`, and every
 * reader downstream can tell the difference between a score and a score anybody may quote.
 */

// --- Weighting -------------------------------------------------------------------

/**
 * Inspect a declared weighting: which areas an institution says matter, and how much.
 *
 * Every issue is fatal here, which is a departure from how this package treats lesson applicability, and the
 * asymmetry is deliberate. A lesson with one unrecognised area is still a lesson; a weighting with one
 * unrecognised area is not a weighting minus one entry, it is a weighting whose remaining entries no longer sum
 * to anything the institution declared. Dropping the bad entry and assessing against the rest would silently
 * redistribute a fifth of the institution's maturity across the areas that happened to spell their names right.
 *
 * {@link MIN_AREA_WEIGHT} and {@link MAX_AREA_WEIGHT} bound each entry for different reasons. The floor exists
 * because an area weighted at a thousandth is present in name only — it satisfies the coverage arithmetic while
 * contributing nothing, which is the cheapest way to make an inconvenient capability disappear without deleting
 * it. The ceiling exists because a single area above a half *is* the score, and an institution that has decided
 * one capability is its maturity has stopped assessing and started reporting.
 *
 * The sum check runs last and only when something was declared, so an empty weighting is reported as empty
 * rather than as an empty thing that also fails to add up to one.
 */
export const inspectWeighting = (declared: readonly AreaWeight[]): WeightingVerdict => {
  const issues: WeightingIssue[] = [];
  const fault = (code: string): void => {
    issues.push({ code, entryIndex: null });
  };

  const weights: ResolvedWeight[] = [];
  const seen = new Set<string>();

  declared.forEach((entry, index) => {
    const at = (code: string): void => {
      issues.push({ code, entryIndex: index });
    };

    const area = normalizeKey(entry.area);
    if (!isCapabilityArea(area)) {
      at("unknown_area");
      return;
    }
    if (seen.has(area)) {
      at("duplicate_area");
      return;
    }
    seen.add(area);

    if (!isFiniteMeasure(entry.weight)) {
      at("invalid_weight");
      return;
    }

    const weight = roundWeight(entry.weight);
    if (weight < MIN_AREA_WEIGHT) {
      at("weight_too_small");
      return;
    }
    if (weight > MAX_AREA_WEIGHT) {
      at("weight_too_large");
      return;
    }

    weights.push({ area, weight });
  });

  const total = roundWeight(weights.reduce((sum, entry) => sum + entry.weight, 0));

  if (declared.length === 0) fault("no_weights");
  else if (Math.abs(total - WEIGHT_SUM) > WEIGHT_TOLERANCE) fault("weights_do_not_sum");

  return { usable: issues.length === 0, weights, total, issues };
};

// --- Levels ----------------------------------------------------------------------

/**
 * The maturity level a score sits at.
 *
 * The floors are walked upward and the last one met wins, which makes the boundaries inclusive: a score of
 * exactly 3 is `defined`, not the top of `developing`. An assessor who wrote 3 meant the word attached to 3, and
 * a boundary reading the other way would put every whole number one level below where its author put it —
 * quietly, and only ever downward.
 *
 * Off-scale input is clamped rather than refused, and non-finite input floors rather than ceilings. That is
 * {@link clampMaturityScore}'s rule and it belongs to the whole platform: a score nobody can compute is not
 * evidence of excellence, and defaulting it upward is how one broken reading becomes a level.
 */
export const levelForScore = (score: number): MaturityLevel => {
  const clamped = clampMaturityScore(score);
  let level: MaturityLevel = "initial";
  for (const candidate of MATURITY_LEVELS) {
    if (clamped >= LEVEL_FLOORS[candidate]) level = candidate;
  }
  return level;
};

// --- Assessment ------------------------------------------------------------------

/**
 * Assess an institution's maturity from what its areas reported, weighted as the institution declared.
 *
 * The weights are taken as given. They are {@link ResolvedWeight} values, which is to say they already came
 * through {@link inspectWeighting}, and re-checking them here would put two engines in charge of one question —
 * the arrangement this package refuses everywhere, because the day they disagree the institution has two answers
 * about its own configuration and no way to tell which one produced last term's number.
 *
 * A reading for an area with no declared weight is reported as `unweighted_area` and excluded rather than
 * assessed at some default. There is no honest default: a weight is a statement about what an institution thinks
 * matters, and inventing one would let the platform hold an opinion about that on the institution's behalf.
 *
 * The index is a weighted mean over the reported areas' *own* weights rather than over all declared weights, so
 * an area that did not report neither contributes nor drags. Dividing by the full declared weight would push the
 * index below the bottom of the scale for any institution with real coverage gaps, producing a number that reads
 * as a terrible institution when what it describes is an incomplete assessment. Those are different findings and
 * `coverage` is where the second one lives — measured against all ten areas, so an institution cannot improve it
 * by declaring fewer.
 *
 * With nothing reported the index floors at {@link MIN_MATURITY_SCORE} rather than resolving to a division by
 * zero or an optimistic midpoint. An assessment that measured nothing has demonstrated nothing, and `initial` is
 * the honest reading of that; it can never be `publishable` in any case, because zero areas is zero coverage.
 * Only the stronger of the two coverage issues is raised — an assessment with no reported area is not also
 * separately below the floor, and reporting both would have a caller fixing one problem twice.
 */
export const assessMaturity = (
  readings: readonly AreaReading[],
  weights: readonly ResolvedWeight[],
): MaturityVerdict => {
  const weightByArea = new Map<CapabilityArea, number>();
  for (const entry of weights) weightByArea.set(entry.area, entry.weight);

  const issues: MaturityIssue[] = [];
  const note = (code: string): void => {
    issues.push({ code, readingIndex: null });
  };

  const areas: AreaOutcome[] = [];
  const seen = new Set<string>();

  readings.forEach((reading, index) => {
    const at = (code: string): void => {
      issues.push({ code, readingIndex: index });
    };

    const area = normalizeKey(reading.area);
    if (!isCapabilityArea(area)) {
      at("unknown_area");
      return;
    }
    if (seen.has(area)) {
      at("duplicate_reading");
      return;
    }
    seen.add(area);

    const weight = weightByArea.get(area);
    if (weight === undefined) {
      at("unweighted_area");
      return;
    }

    const score = clampMaturityScore(reading.score);
    if (score !== reading.score) at("score_off_scale");

    const reported = reading.evidenceCount >= MIN_EVIDENCE_PER_AREA;
    if (!reported) at("insufficient_evidence");

    areas.push({ area, score, weight, evidenceCount: reading.evidenceCount, reported });
  });

  const contributing = areas.filter((outcome) => outcome.reported);
  const areasReported = contributing.length;
  const coverage = roundWeight(areasReported / CAPABILITY_AREA_COUNT);
  const weighted = contributing.reduce((sum, outcome) => sum + outcome.weight, 0);

  const index =
    weighted > 0
      ? roundMaturity(
          contributing.reduce((sum, outcome) => sum + outcome.weight * outcome.score, 0) / weighted,
        )
      : MIN_MATURITY_SCORE;

  if (areasReported === 0) note("no_area_reported");
  else if (coverage < MIN_AREA_COVERAGE) note("below_coverage_floor");

  return {
    publishable: areasReported > 0 && coverage >= MIN_AREA_COVERAGE,
    index,
    level: levelForScore(index),
    coverage,
    areasReported,
    areas,
    issues,
  };
};
