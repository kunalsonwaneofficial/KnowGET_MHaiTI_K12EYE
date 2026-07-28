import {
  BAND_FLOORS,
  MAX_NORMALIZED_SCORE,
  MIN_NORMALIZED_SCORE,
  PERFORMANCE_BANDS,
  type PerformanceBand,
  SUSTAINED_DECLINE_PERIODS,
  bandRank,
  isFiniteMeasure,
  roundIndexValue,
} from "./command-value";
import type { BandDirection, BandMovement, TrendVerdict } from "./command-view";

/**
 * The banding engine: what a normalized score is called, and what it did.
 *
 * Small on purpose. Everything here operates on the normalized 0–100 scale and never on a raw measure, which is
 * what lets one set of band boundaries mean the same thing for an attendance percentage, a collection rate and
 * a staff-turnover count. The institution's opinions live entirely in the anchors of its scales (see
 * {@link file://./measurement.ts}); by the time a score reaches this module every institution-specific judgement
 * has already been applied and the arithmetic is common.
 *
 * The engine never refuses and never throws. A score outside the scale is clamped rather than rejected, because
 * this module is downstream of validation and a defensive clamp keeps one bad reading from taking a whole
 * assessment down. Where a caller genuinely has nothing to band — no scores at all — the functions return
 * `null` rather than a default band, since there is no such thing as the band of no measurement and returning
 * `failing` for it would raise an alarm about a pillar nobody measured.
 *
 * The distinction this module exists to hold is between a *state* and a *movement*. {@link bandFor} answers
 * where something is; {@link bandMovement} and {@link summarizeTrend} answer where it is going. Leadership
 * attention is far more often owed to the second — a pillar that has sat at `at_risk` all year is a known
 * condition somebody is presumably already working on, while a pillar that fell two bands this term is news —
 * and keeping the two computations separate is what stops a dashboard from reporting only the first.
 */

// --- Placement -------------------------------------------------------------------

/** How many consecutive scores are needed before direction is a question with an answer. */
export const MIN_PERIODS_FOR_TREND = 2;

/**
 * Clamp a score onto the normalized scale.
 *
 * A finite score outside the scale clamps toward the end it overshot, which is ordinary defensiveness. A
 * non-finite one floors regardless of its sign, and that asymmetry is the point: `Infinity` is not a very good
 * score, it is a broken one, and clamping it upward would let a division by zero somewhere upstream surface as
 * the best-performing pillar in the school. Flooring a corrupt reading raises a false alarm that somebody
 * investigates; ceilinging one buys silence. The same reasoning runs through {@link worstBand} and through
 * `measure`'s refusal to fabricate a plausible score.
 */
const clampScore = (score: number): number => {
  if (!isFiniteMeasure(score)) return MIN_NORMALIZED_SCORE;
  if (score < MIN_NORMALIZED_SCORE) return MIN_NORMALIZED_SCORE;
  if (score > MAX_NORMALIZED_SCORE) return MAX_NORMALIZED_SCORE;
  return score;
};

/**
 * The band a normalized score falls in: the highest band whose floor it reaches.
 *
 * Floors are inclusive, so a score sitting exactly on a boundary takes the better band. That choice is
 * deliberate and it is the safer one in both directions: an institution that set its `healthy` threshold at
 * exactly 70 meant 70 to be healthy, and a boundary that read the other way would make every round number in
 * every scale sit one band below where its author put it.
 */
export const bandFor = (score: number): PerformanceBand => {
  const clamped = clampScore(score);
  let placed: PerformanceBand = PERFORMANCE_BANDS[0];
  for (const band of PERFORMANCE_BANDS) {
    if (clamped >= BAND_FLOORS[band]) placed = band;
  }
  return placed;
};

/**
 * The worst band across a set, or `null` for an empty set.
 *
 * How a briefing leads. An institution's attention belongs at its weakest pillar, and the alternative — leading
 * with the composite — is precisely how a school with one failing pillar and nine exemplary ones reads as fine.
 */
export const worstBand = (bands: readonly PerformanceBand[]): PerformanceBand | null => {
  let worst: PerformanceBand | null = null;
  for (const band of bands) {
    if (worst === null || bandRank(band) < bandRank(worst)) worst = band;
  }
  return worst;
};

/** The best band across a set, or `null` for an empty set. */
export const bestBand = (bands: readonly PerformanceBand[]): PerformanceBand | null => {
  let best: PerformanceBand | null = null;
  for (const band of bands) {
    if (best === null || bandRank(band) > bandRank(best)) best = band;
  }
  return best;
};

// --- Movement --------------------------------------------------------------------

/**
 * What happened between two bands.
 *
 * `steps` is signed in the direction a reader expects — positive is better — and counts positions rather than
 * score points, because a two-band fall is a different kind of event from a one-band fall regardless of how many
 * points separated them. A pillar that dropped eleven points inside `healthy` has not moved; one that dropped
 * two points across a floor has.
 */
export const bandMovement = (from: PerformanceBand, to: PerformanceBand): BandMovement => {
  const steps = bandRank(to) - bandRank(from);
  const direction: BandDirection = steps > 0 ? "improved" : steps < 0 ? "declined" : "held";
  return { from, to, steps, direction };
};

/** Whether a movement crossed downward into a worse band. What attention is raised on. */
export const isBandFall = (movement: BandMovement): boolean => movement.direction === "declined";

// --- Trend -----------------------------------------------------------------------

/**
 * Summarize a run of consecutive scores, oldest first.
 *
 * Two things are reported and they answer different questions. `netChange` is where the series ended up
 * relative to where it started — the answer to "are we better off than a year ago". `decliningRun` counts the
 * consecutive falls *ending at the most recent score* — the answer to "is it getting worse right now". A series
 * can easily say yes to both, and a summary that reported only the first would describe a school that has
 * improved over the year and been sliding since March as simply improved.
 *
 * The run is counted at the end rather than taken as the longest anywhere in the series on purpose: a three-term
 * decline that ended two terms ago is a problem somebody has already dealt with, and leading a briefing with it
 * spends the one piece of leadership attention this whole contract exists to allocate.
 *
 * Equal consecutive scores break a run rather than extending it. A flat period is not a fall, and treating it as
 * one would let rounding noise in a stable series manufacture a sustained decline.
 */
export const summarizeTrend = (scores: readonly number[]): TrendVerdict => {
  const usable = scores.filter(isFiniteMeasure);
  const periods = usable.length;
  if (periods < MIN_PERIODS_FOR_TREND) {
    return { periods, decliningRun: 0, sustainedDecline: false, netChange: 0 };
  }

  let decliningRun = 0;
  for (let i = periods - 1; i > 0; i -= 1) {
    const current = usable[i] as number;
    const previous = usable[i - 1] as number;
    if (current < previous) decliningRun += 1;
    else break;
  }

  const first = usable[0] as number;
  const last = usable[periods - 1] as number;

  return {
    periods,
    decliningRun,
    sustainedDecline: decliningRun >= SUSTAINED_DECLINE_PERIODS,
    netChange: roundIndexValue(last - first),
  };
};
