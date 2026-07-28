import { bandFor } from "./banding";
import {
  BAND_FLOORS,
  MAX_NORMALIZED_SCORE,
  MIN_NORMALIZED_SCORE,
  POLARITIES_REQUIRING_TARGET,
  isMeasureAdmissible,
  isNormalizedScore,
  roundIndexValue,
} from "./command-value";
import type {
  ClampOutcome,
  Measurement,
  MeasurementScale,
  ScaleIssue,
  ScaleVerdict,
  ScoreAnchor,
} from "./command-view";

/**
 * The measurement engine: how a raw institutional number becomes a score that can be compared to another one.
 *
 * This is where the platform's single most delicate boundary is drawn. An institution must be able to say what
 * *good* means for its own indicators — a rural day school and a selective boarding school do not share a view
 * of what attendance figure is exemplary, and a platform that imposed one would be wrong about both. But the
 * moment two institutions score against different definitions, no index built on top of them can be compared,
 * rolled up across a group, or read as a series through a change of leadership.
 *
 * The resolution is that the institution declares **anchors** and the platform owns the **scale**. An anchor
 * says "96% is worth 100 here"; the normalized 0–100 scale those anchors map onto is common to everyone, and so
 * are the bands that partition it. Every institution-specific judgement is therefore captured in data that sits
 * on the KPI definition where an auditor can read it, rather than in behaviour that differs per tenant.
 *
 * Normalization is piecewise-linear between anchors and clamped outside them. Linear interpolation is chosen
 * over anything cleverer for one reason: an author has to be able to predict what a scale will do. A curve
 * fitted through the anchors would score values the author never specified in ways they could not have
 * anticipated, and the first time a KPI reported a number nobody expected, the honest explanation would be that
 * the platform interpolated it — which is not an explanation a head teacher should ever have to accept about
 * their own school's attendance score.
 *
 * {@link validateScale} refuses; {@link measure} does not. The split matters. A scale is authored once and can
 * be rejected at authoring time with every fault listed, when there is a person present to fix it. A measure
 * arrives thousands of times afterwards from an operational domain, when there is nobody to ask, and the
 * honest response to one that cannot be scored is a record saying so rather than an exception that loses it.
 */

// --- Scale validation ------------------------------------------------------------

/** Below two anchors there is nothing to interpolate between and the scale scores everything the same. */
export const MIN_SCALE_ANCHORS = 2;

/**
 * Stable codes for what can be wrong with a declared scale.
 *
 * Reported all at once rather than one at a time. An author fixing a scale is working through a form, and a
 * validator that surfaces the next fault only after the last one is fixed turns a two-minute correction into
 * five round trips — which is how institutions end up with one permissive scale copied everywhere instead of
 * the ten considered ones they meant to write.
 */
export const SCALE_ISSUE_CODES = [
  "too_few_anchors",
  "unsorted_anchors",
  "duplicate_anchor_value",
  "inadmissible_anchor_value",
  "score_out_of_range",
  "flat_scale",
  "wrong_direction",
  "target_peak_missing",
  "target_not_interior",
  "unreachable_healthy_band",
] as const;
export type ScaleIssueCode = (typeof SCALE_ISSUE_CODES)[number];

const issue = (code: ScaleIssueCode, anchorIndex: number | null): ScaleIssue => ({
  code,
  anchorIndex,
});

/** Whether a run of scores never falls. Flats are permitted — a plateau is a legitimate thing to declare. */
const isNonDecreasing = (scores: readonly number[]): boolean =>
  scores.every((score, i) => i === 0 || score >= (scores[i - 1] as number));

/** Whether a run of scores never rises. */
const isNonIncreasing = (scores: readonly number[]): boolean =>
  scores.every((score, i) => i === 0 || score <= (scores[i - 1] as number));

/**
 * Inspect a declared scale and report everything wrong with it.
 *
 * The checks run in two passes. Structural faults — too few anchors, values out of order or repeated, values
 * inadmissible in the unit, scores off the normalized scale — are gathered first, and the shape checks are
 * skipped when any of them fired. That is not laziness: "your scores do not rise" is a confusing thing to be
 * told about a list whose values are in the wrong order, and reporting a derived complaint on top of the
 * structural one that caused it sends authors chasing the wrong fault.
 */
export const validateScale = (scale: MeasurementScale): ScaleVerdict => {
  const anchors = scale.anchors;
  const issues: ScaleIssue[] = [];

  if (anchors.length < MIN_SCALE_ANCHORS) issues.push(issue("too_few_anchors", null));

  anchors.forEach((anchor, index) => {
    if (!isMeasureAdmissible(scale.unit, anchor.value)) {
      issues.push(issue("inadmissible_anchor_value", index));
    }
    if (!isNormalizedScore(anchor.score)) {
      issues.push(issue("score_out_of_range", index));
    }
    if (index > 0) {
      const previous = anchors[index - 1] as ScoreAnchor;
      if (anchor.value === previous.value) issues.push(issue("duplicate_anchor_value", index));
      else if (anchor.value < previous.value) issues.push(issue("unsorted_anchors", index));
    }
  });

  if (issues.length > 0) return { usable: false, issues };

  const scores = anchors.map((anchor) => anchor.score);
  const highest = Math.max(...scores);
  const lowest = Math.min(...scores);

  if (highest === lowest) {
    issues.push(issue("flat_scale", null));
    return { usable: false, issues };
  }

  if (POLARITIES_REQUIRING_TARGET.includes(scale.polarity)) {
    const first = scores.indexOf(highest);
    const last = scores.lastIndexOf(highest);
    const rises = isNonDecreasing(scores.slice(0, first + 1));
    const falls = isNonIncreasing(scores.slice(last));
    const plateau = scores.slice(first, last + 1).every((score) => score === highest);
    if (!rises || !falls || !plateau) issues.push(issue("target_peak_missing", null));
    else if (first === 0 || last === scores.length - 1)
      issues.push(issue("target_not_interior", null));
  } else if (scale.polarity === "higher_is_better") {
    if (!isNonDecreasing(scores)) issues.push(issue("wrong_direction", null));
  } else if (!isNonIncreasing(scores)) {
    issues.push(issue("wrong_direction", null));
  }

  if (highest < BAND_FLOORS.healthy) issues.push(issue("unreachable_healthy_band", null));

  return { usable: issues.length === 0, issues };
};

// --- Normalization ---------------------------------------------------------------

/** Where a raw measure sat relative to the ends of its scale. */
export const clampOutcomeFor = (scale: MeasurementScale, raw: number): ClampOutcome => {
  const first = scale.anchors[0];
  const last = scale.anchors[scale.anchors.length - 1];
  if (!first || !last) return "none";
  if (raw < first.value) return "below";
  if (raw > last.value) return "above";
  return "none";
};

/**
 * Map a raw measure onto the normalized scale by linear interpolation between the anchors that bracket it.
 *
 * Expects a scale that {@link validateScale} accepted; the guards here are defensive rather than diagnostic, so
 * that a scale which slipped through cannot take down an assessment of the other nine pillars. Outside the
 * declared anchors the score is clamped to the nearest end, which is why {@link measure} reports the clamp
 * separately — a clamped score is a floor or a ceiling, not a measurement, and a scale that clamps often has
 * stopped discriminating and wants re-anchoring.
 */
export const normalizeMeasure = (scale: MeasurementScale, raw: number): number => {
  const anchors = scale.anchors;
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (!first || !last) return MIN_NORMALIZED_SCORE;
  if (raw <= first.value) return roundIndexValue(first.score);
  if (raw >= last.value) return roundIndexValue(last.score);

  for (let i = 1; i < anchors.length; i += 1) {
    const lower = anchors[i - 1] as ScoreAnchor;
    const upper = anchors[i] as ScoreAnchor;
    if (raw > upper.value) continue;
    const span = upper.value - lower.value;
    if (span <= 0) return roundIndexValue(upper.score);
    const position = (raw - lower.value) / span;
    const interpolated = lower.score + position * (upper.score - lower.score);
    return roundIndexValue(
      Math.min(MAX_NORMALIZED_SCORE, Math.max(MIN_NORMALIZED_SCORE, interpolated)),
    );
  }

  return roundIndexValue(last.score);
};

/**
 * Score one raw measure against a scale, or say why it could not be.
 *
 * The refusals are the interesting half. A value that is not admissible in the KPI's own unit — a percentage of
 * 140, a fractional headcount — is not scored low, it is not scored at all, because a fabricated score for a
 * corrupt reading propagates into a pillar, an index and a briefing with nothing on it to say where it came
 * from. Likewise a scale that does not validate produces no score rather than a plausible one.
 *
 * Both refusals are values, not exceptions. A reading that cannot be scored still has to be recordable, since
 * "the attendance feed sent us nonsense this week" is exactly the kind of thing a coverage report exists to
 * surface, and an exception thrown here would erase it.
 */
export const measure = (scale: MeasurementScale, raw: number): Measurement => {
  if (!isMeasureAdmissible(scale.unit, raw)) {
    return { scoreable: false, raw, reason: "inadmissible_value" };
  }
  if (!validateScale(scale).usable) {
    return { scoreable: false, raw, reason: "unusable_scale" };
  }

  const score = normalizeMeasure(scale, raw);
  return {
    scoreable: true,
    raw,
    score,
    band: bandFor(score),
    clamp: clampOutcomeFor(scale, raw),
  };
};
