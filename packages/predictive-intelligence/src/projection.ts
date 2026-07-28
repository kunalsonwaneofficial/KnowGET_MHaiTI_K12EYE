import type {
  FittedPoint,
  Observation,
  ProjectionParameters,
  ProjectionPoint,
  ProjectionResult,
  ResolvedProjectionParameters,
} from "./forecast-view";
import type { ForecastMethod } from "./forecast-value";
import { roundValue } from "./forecast-value";
import { sortObservations } from "./series";

/**
 * The projection engine: six closed-form methods, each a pure function of the pinned observations and the
 * resolved parameters.
 *
 * Every method here produces two things and both matter. The **points** are the forecast anyone asked for. The
 * **fitted values** are what the same method would have said about periods it can already see, and they are the
 * only honest basis for the intervals the next engine attaches — a method's future error is estimated from its
 * past error on this series, not from an assumed distribution that nobody can check against reality.
 *
 * No method here fits by iteration, converges on a criterion, initializes randomly or reads a learned artefact.
 * That is the boundary the contract's fourth rule requires: a projection is reproducible because it is
 * arithmetic over recorded inputs, not because a training run was carefully logged. When statistical or learned
 * models arrive they will arrive with their own artefact custody and their own kind of model — not by widening
 * this file.
 *
 * Future periods are always contiguous from the last observed period, `last + 1 … last + horizon`, whatever
 * gaps sit behind them. A gap is a missing observation, not a missing period, and the grid is what it is.
 */

// --- Parameters ------------------------------------------------------------------

/** The moving-average window used when a model declares none, subject to the series being long enough. */
export const DEFAULT_WINDOW_SIZE = 3;

/**
 * The level-smoothing factor used when a model declares none. `0.3` weights recent periods appreciably without
 * collapsing towards the naive method, which `alpha` near 1 does — an exponential smoother that has degenerated
 * into "the last value" is a method whose name no longer describes it.
 */
export const DEFAULT_ALPHA = 0.3;

/**
 * Apply defaults and clamp to what this series can actually support.
 *
 * Clamping rather than rejecting is deliberate. A model declaring a twelve-period window against nine
 * observations has made a mistake worth correcting, but failing the run leaves the institution with nothing;
 * resolving to the largest workable window and pinning *that* onto the run leaves them with a forecast and an
 * exact record of what produced it. The resolved value is what gets digested, so the correction is never silent.
 */
export const resolveParameters = (
  parameters: ProjectionParameters,
  observationCount: number,
): ResolvedProjectionParameters => {
  const requestedWindow = parameters.windowSize;
  const defaultWindow = Math.min(DEFAULT_WINDOW_SIZE, Math.max(1, observationCount));
  const window =
    requestedWindow === undefined || !Number.isInteger(requestedWindow) || requestedWindow < 1
      ? defaultWindow
      : Math.min(requestedWindow, Math.max(1, observationCount));

  const requestedAlpha = parameters.alpha;
  const alpha =
    requestedAlpha === undefined ||
    !Number.isFinite(requestedAlpha) ||
    requestedAlpha <= 0 ||
    requestedAlpha > 1
      ? DEFAULT_ALPHA
      : requestedAlpha;

  return { windowSize: window, alpha };
};

// --- Shared helpers --------------------------------------------------------------

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;

/** Pair actuals with fitted values, dropping periods the method could not fit, and round every derived figure. */
const toFitted = (
  observations: readonly Observation[],
  fittedByIndex: ReadonlyMap<number, number>,
): readonly FittedPoint[] => {
  const points: FittedPoint[] = [];
  observations.forEach((observation, index) => {
    const fitted = fittedByIndex.get(index);
    if (fitted === undefined) return;
    points.push({
      period: observation.period,
      actual: observation.value,
      fitted: roundValue(fitted),
      residual: roundValue(observation.value - fitted),
    });
  });
  return points;
};

/** Ordinary least squares of value on period. Slope is zero where the periods carry no spread to regress on. */
export const fitLinearTrend = (
  observations: readonly Observation[],
): { readonly slope: number; readonly intercept: number } => {
  if (observations.length === 0) return { slope: 0, intercept: 0 };
  const periodMean = mean(observations.map((observation) => observation.period));
  const valueMean = mean(observations.map((observation) => observation.value));

  let covariance = 0;
  let variance = 0;
  for (const observation of observations) {
    const centredPeriod = observation.period - periodMean;
    covariance += centredPeriod * (observation.value - valueMean);
    variance += centredPeriod ** 2;
  }
  const slope = variance === 0 ? 0 : covariance / variance;
  return { slope, intercept: valueMean - slope * periodMean };
};

// --- The engine ------------------------------------------------------------------

/**
 * Project `horizon` periods ahead by the declared method.
 *
 * The horizon ceiling is **not** enforced here. That is the aggregate's job, and separating them is what lets a
 * backtest project across a holdout the platform would refuse to publish forward — scoring a method over more
 * periods than it may claim is exactly how you find out whether the ceiling is in the right place. Nothing that
 * reaches an API goes through this function without the aggregate's check first.
 *
 * An empty series yields an empty result rather than throwing: callers arrive past {@link inspectSeries}, and a
 * total function is easier to compose than one with a documented precondition somebody will eventually miss.
 */
export const project = (
  method: ForecastMethod,
  observations: readonly Observation[],
  horizon: number,
  parameters: ProjectionParameters = {},
  cycleLength: number | null = null,
): ProjectionResult => {
  const sorted = sortObservations(observations);
  const resolved = resolveParameters(parameters, sorted.length);
  const empty: ProjectionResult = {
    method,
    parameters: resolved,
    points: [],
    fitted: [],
    fallbackPeriods: [],
  };
  if (sorted.length === 0 || !Number.isInteger(horizon) || horizon < 1) return empty;

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) return empty;

  const values = sorted.map((observation) => observation.value);
  const horizons = Array.from({ length: horizon }, (_, index) => index + 1);
  const fittedByIndex = new Map<number, number>();
  const fallbackPeriods: number[] = [];
  let valueAt: (h: number) => number;

  switch (method) {
    case "naive": {
      // The skill baseline. Its residuals are the period-to-period changes, which is exactly why beating it is
      // the minimum bar: a method that cannot is not describing anything the series does not already say.
      for (let index = 1; index < sorted.length; index += 1) {
        fittedByIndex.set(index, values[index - 1] ?? 0);
      }
      valueAt = () => last.value;
      break;
    }

    case "drift": {
      // The straight line through the first and last observations only — deliberately not a regression. Drift
      // answers "if the overall movement so far continues", and a method that reads only the endpoints says so
      // plainly rather than looking like a fit that weighed everything in between.
      const span = last.period - first.period;
      const slope = span === 0 ? 0 : (last.value - first.value) / span;
      for (let index = 1; index < sorted.length; index += 1) {
        const previous = sorted[index - 1];
        const current = sorted[index];
        if (previous === undefined || current === undefined) continue;
        fittedByIndex.set(index, previous.value + slope * (current.period - previous.period));
      }
      valueAt = (h) => last.value + slope * h;
      break;
    }

    case "moving_average": {
      const window = resolved.windowSize;
      for (let index = window; index < sorted.length; index += 1) {
        fittedByIndex.set(index, mean(values.slice(index - window, index)));
      }
      const level = mean(values.slice(Math.max(0, values.length - window)));
      valueAt = () => level;
      break;
    }

    case "linear_trend": {
      const { slope, intercept } = fitLinearTrend(sorted);
      sorted.forEach((observation, index) => {
        fittedByIndex.set(index, intercept + slope * observation.period);
      });
      valueAt = (h) => intercept + slope * (last.period + h);
      break;
    }

    case "seasonal_naive": {
      // Read the same seasonal position one whole cycle back, walking back further whole cycles while that
      // period is unobserved. Only when the position was never observed in any cycle is there nothing seasonal
      // to say, and then the last value stands in — recorded on `fallbackPeriods`, never interpolated, because
      // inventing the missing season is exactly how a gap in the data becomes a confident claim about it.
      const cycle =
        cycleLength !== null && Number.isInteger(cycleLength) && cycleLength >= 2
          ? cycleLength
          : null;
      const byPeriod = new Map<number, number>(
        sorted.map((observation) => [observation.period, observation.value] as const),
      );
      if (cycle !== null) {
        sorted.forEach((observation, index) => {
          const priorCycle = byPeriod.get(observation.period - cycle);
          if (priorCycle !== undefined) fittedByIndex.set(index, priorCycle);
        });
      } else {
        for (let index = 1; index < sorted.length; index += 1) {
          fittedByIndex.set(index, values[index - 1] ?? 0);
        }
      }
      valueAt = (h) => {
        const period = last.period + h;
        if (cycle === null) return last.value;
        // Walk back whole cycles until a period that was actually observed is found.
        for (let source = period - cycle; source >= first.period; source -= cycle) {
          const value = byPeriod.get(source);
          if (value !== undefined) return value;
        }
        fallbackPeriods.push(period);
        return last.value;
      };
      break;
    }

    case "exponential_smoothing": {
      // Simple exponential smoothing: the level is the whole state, so the projection is flat. There is no
      // trend or seasonal component here — those are `linear_trend` and `seasonal_naive`, named honestly, rather
      // than a single method with three hidden factors nobody pinned.
      const alpha = resolved.alpha;
      let level = values[0] ?? 0;
      for (let index = 1; index < sorted.length; index += 1) {
        fittedByIndex.set(index, level);
        level = alpha * (values[index] ?? 0) + (1 - alpha) * level;
      }
      valueAt = () => level;
      break;
    }
  }

  const points: readonly ProjectionPoint[] = horizons.map((h) => ({
    period: last.period + h,
    horizon: h,
    value: roundValue(valueAt(h)),
  }));

  return {
    method,
    parameters: resolved,
    points,
    fitted: toFitted(sorted, fittedByIndex),
    fallbackPeriods: [...fallbackPeriods].sort((a, b) => a - b),
  };
};

/**
 * The naive projection over the same horizon, used as the skill baseline every accuracy score is measured
 * against. A convenience with a purpose: it keeps "what would doing nothing have given us" a single call away,
 * so no scorer is ever tempted to skip the comparison that makes its number mean something.
 */
export const projectBaseline = (
  observations: readonly Observation[],
  horizon: number,
): ProjectionResult => project("naive", observations, horizon);

/**
 * The seasonal cycle a method actually requires, or `null` where it requires none. Used by the assumption
 * engine to notice a seasonal method running under a set that never declared a seasonality assumption.
 */
export const requiredCycleFor = (
  method: ForecastMethod,
  cycleLength: number | null,
): number | null => (method === "seasonal_naive" ? cycleLength : null);
