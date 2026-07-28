import type {
  ObjectiveProgressView,
  ObjectiveVariance,
  ObjectiveView,
  PlanVariance,
} from "./forecast-view";
import type { MetricDirection, TrackingState } from "./forecast-value";
import {
  PLAN_AT_RISK_TOLERANCE,
  PLAN_ON_TRACK_TOLERANCE,
  normalizeObjectiveKey,
  normalizePlanKey,
  roundValue,
  worseTracking,
} from "./forecast-value";

/**
 * The strategic planning engine: where a plan stops being a document and becomes a measurement.
 *
 * An institutional plan usually fails in a way nobody notices until it is too late to act. The objectives are
 * declared, the review meetings happen, each objective is discussed on its own terms, and the question "are we
 * actually going to arrive" is never asked with a number attached. This engine asks it: against a straight line
 * from where the institution started to where it said it would be, and by the date it said it would be there.
 *
 * Three decisions carry the design. The expected trajectory is **linear** — crude, transparent, and arguable by
 * anyone in the room, which is exactly what a trajectory needs to be, because a curve is a trajectory that can
 * be redefined halfway through by whoever owns the model. An objective with no reading **keeps its last known
 * position** rather than dropping out of the aggregate, because a plan that reports itself healthy while a
 * third of it goes unmeasured is the failure mode, not an edge case. And a plan's state is the **worst** of its
 * objectives, never an average: nine on track and one off track is a plan with a problem, and the aggregate that
 * calls it ninety percent healthy is the instrument that lets an institution walk into a failure it had every
 * piece of information to see coming.
 *
 * Everything here is pure and total. `period` is an integer index into whatever grid the plan declared; this
 * engine never asks what today is, which is what lets a review be recomputed years later and come out the same.
 */

// --- Trajectory ------------------------------------------------------------------

/**
 * How far along the plan a period sits, from 0 at the start to 1 at the target period.
 *
 * Clamped at both ends: before the plan started there is no progress to expect, and after the target period the
 * expectation is the target itself rather than an extrapolation past it. A plan whose target period is at or
 * before its start is due immediately and returns 1, which is the only reading that does not silently divide by
 * zero or invent time the plan never had.
 */
export const elapsedFraction = (
  period: number,
  startPeriod: number,
  targetPeriod: number,
): number => {
  if (targetPeriod <= startPeriod) return 1;
  const raw = (period - startPeriod) / (targetPeriod - startPeriod);
  return Math.min(1, Math.max(0, raw));
};

/** Where an objective should be at a period if it is travelling in a straight line to its target. */
export const expectedValueAt = (
  objective: ObjectiveView,
  period: number,
  startPeriod: number,
): number => {
  const elapsed = elapsedFraction(period, startPeriod, objective.targetPeriod);
  return roundValue(
    objective.baselineValue + elapsed * (objective.targetValue - objective.baselineValue),
  );
};

/**
 * The fraction of the baseline-to-target distance an objective has covered, or `null` where it asked for no
 * movement.
 *
 * Signed distance does the direction normalization on its own: an objective aiming downward has a negative
 * distance, so falling gives a positive ratio and rising gives a negative one, and the same expression reads
 * correctly whichever way the metric is supposed to move. Values above 1 mean the objective has travelled past
 * its target, which is information a plan review wants rather than something to clamp away.
 */
export const progressRatioFor = (objective: ObjectiveView, actualValue: number): number | null => {
  const distance = objective.targetValue - objective.baselineValue;
  if (distance === 0) return null;
  return roundValue((actualValue - objective.baselineValue) / distance);
};

// --- Judgement -------------------------------------------------------------------

/**
 * Whether the objective's target has been met.
 *
 * The direction is doing real work here rather than decorating the record. For a directional metric, met means
 * met *or better* — an attendance objective that overshot its target has been achieved, and so has an absence
 * objective that fell further than it promised. A `neutral` metric has no better side by definition, so only
 * arriving at the target counts, compared at {@link roundValue} precision because a neutral objective judged on
 * exact float equality would almost never register.
 */
export const hasMetTarget = (
  direction: MetricDirection,
  actualValue: number,
  targetValue: number,
): boolean => {
  switch (direction) {
    case "higher_is_better":
      return actualValue >= targetValue;
    case "lower_is_better":
      return actualValue <= targetValue;
    case "neutral":
      return roundValue(actualValue) === roundValue(targetValue);
  }
};

/**
 * How far behind the straight line an objective sits, as a fraction of the whole journey. Negative means ahead.
 *
 * Normalized by the absolute distance so the answer is a fraction of the journey rather than of the metric, and
 * signed by direction so that "behind" means the same thing for a metric climbing and a metric falling. A
 * `neutral` metric is measured on absolute deviation: with no better side, running ahead of the line is as much
 * a departure from the plan as falling behind it, and reporting an overshoot as healthy would be the engine
 * assuming a preference the metric explicitly declined to state.
 */
export const shortfallRatio = (
  direction: MetricDirection,
  actualValue: number,
  expectedValue: number,
  distance: number,
): number => {
  const scale = Math.abs(distance);
  if (scale === 0) return 0;
  const gap = actualValue - expectedValue;
  switch (direction) {
    case "higher_is_better":
      return roundValue(-gap / scale);
    case "lower_is_better":
      return roundValue(gap / scale);
    case "neutral":
      return roundValue(Math.abs(gap) / scale);
  }
};

/**
 * The state an objective is in at a period.
 *
 * Order matters and is deliberate. Meeting the target wins over everything, including a target period that has
 * passed — an objective delivered late is delivered. Then a target period gone by without the target met is
 * `missed`, whatever the trajectory looked like on the way. Only inside the plan's own window does the straight
 * line get consulted at all.
 *
 * An objective whose baseline already equals its target is the one case with no journey to measure. It has
 * asked the institution to hold a level, and there is no partial credit for holding it partly: either
 * {@link hasMetTarget} is satisfied or the objective is `off_track`. Deriving a band from the metric's own
 * magnitude would make the verdict depend on the units, which is how a percentage and a headcount end up judged
 * by different standards for the same slip.
 */
export const trackingStateFor = (
  objective: ObjectiveView,
  actualValue: number,
  expectedValue: number,
  period: number,
): TrackingState => {
  if (hasMetTarget(objective.direction, actualValue, objective.targetValue)) return "achieved";
  if (period >= objective.targetPeriod) return "missed";

  const distance = objective.targetValue - objective.baselineValue;
  if (distance === 0) return "off_track";

  const shortfall = shortfallRatio(objective.direction, actualValue, expectedValue, distance);
  if (shortfall <= PLAN_ON_TRACK_TOLERANCE) return "on_track";
  if (shortfall <= PLAN_AT_RISK_TOLERANCE) return "at_risk";
  return "off_track";
};

// --- Variance --------------------------------------------------------------------

/**
 * The most recent reading for an objective at or before a period, or `null` where none was ever recorded.
 *
 * At-or-before rather than exactly-at, because reviews do not land on every period and the honest reading of a
 * plan between reviews is the last thing anybody actually measured. Where two readings share a period the later
 * one in the list wins, which is the only tiebreak available without a clock and is the conventional reading of
 * a correction appended after the fact.
 */
export const latestProgressAt = (
  progress: readonly ObjectiveProgressView[],
  objectiveKey: string,
  period: number,
): ObjectiveProgressView | null => {
  const key = normalizeObjectiveKey(objectiveKey);
  let latest: ObjectiveProgressView | null = null;
  for (const record of progress) {
    if (normalizeObjectiveKey(record.objectiveKey) !== key) continue;
    if (record.period > period) continue;
    if (latest === null || record.period >= latest.period) latest = record;
  }
  return latest;
};

/**
 * Where one objective stands at a period.
 *
 * With no reading at or before the period the objective is scored at its baseline. That is a claim, and it is
 * the right one: nothing has been reported as having moved, so the objective is treated as being where it
 * started. The alternative — leaving it out of the plan's aggregate — hides an unmeasured objective behind the
 * measured ones, and an objective nobody has reviewed is exactly the objective a plan review needs to surface.
 */
export const computeObjectiveVariance = (
  objective: ObjectiveView,
  progress: readonly ObjectiveProgressView[],
  period: number,
  startPeriod: number,
): ObjectiveVariance => {
  const latest = latestProgressAt(progress, objective.objectiveKey, period);
  const actualValue = latest === null ? objective.baselineValue : latest.actualValue;
  const expectedValue = expectedValueAt(objective, period, startPeriod);

  return {
    objectiveKey: normalizeObjectiveKey(objective.objectiveKey),
    period,
    expectedValue,
    actualValue,
    variance: roundValue(actualValue - expectedValue),
    progressRatio: progressRatioFor(objective, actualValue),
    state: trackingStateFor(objective, actualValue, expectedValue, period),
  };
};

/**
 * Where a whole plan stands at a period.
 *
 * The counts and the state answer different questions and both are needed. The counts say how much of the plan
 * is in trouble, which is what a leadership team allocates attention with. The state says whether the plan is in
 * trouble, and it is the worst objective's state rather than a blend, because a plan is a commitment to all of
 * its objectives and the one that fails is the one that will be asked about.
 *
 * A plan with no objectives comes back `on_track`: there is nothing failing, and an aggregate is the wrong place
 * to object to an empty plan — that belongs to the invariants of the plan itself, where an empty plan can be
 * refused before anybody commits to it.
 */
export const computePlanVariance = (
  planKey: string,
  objectives: readonly ObjectiveView[],
  progress: readonly ObjectiveProgressView[],
  period: number,
  startPeriod: number,
): PlanVariance => {
  const variances = objectives
    .map((objective) => computeObjectiveVariance(objective, progress, period, startPeriod))
    .sort((a, b) =>
      a.objectiveKey === b.objectiveKey ? 0 : a.objectiveKey < b.objectiveKey ? -1 : 1,
    );

  const count = (state: TrackingState): number =>
    variances.filter((variance) => variance.state === state).length;

  return {
    planKey: normalizePlanKey(planKey),
    period,
    objectives: variances,
    onTrackCount: count("on_track"),
    atRiskCount: count("at_risk"),
    offTrackCount: count("off_track"),
    achievedCount: count("achieved"),
    missedCount: count("missed"),
    state: worstStateOf(variances),
  };
};

/**
 * The worst state among a plan's objectives, or `on_track` where it has none.
 *
 * Folded from the first objective rather than from a seed, because seeding with `on_track` would mean a plan
 * whose objectives are every one of them achieved came back merely on track — the fold would keep choosing the
 * seed, which is worse than `achieved`, and the plan would understate its own success for the whole of its life.
 */
const worstStateOf = (variances: readonly ObjectiveVariance[]): TrackingState => {
  const [first, ...rest] = variances;
  if (first === undefined) return "on_track";
  return rest.reduce<TrackingState>(
    (worst, variance) => worseTracking(worst, variance.state),
    first.state,
  );
};
