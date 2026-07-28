import { PlatformError } from "@knowget/exceptions";

/**
 * The domain error model for predictive intelligence. Every failure this contract can produce is a typed,
 * operational error carrying a stable code, an HTTP status and structured details — never a bare string, and
 * never free text an API consumer has to parse.
 *
 * Almost all of these are refusals rather than faults, and the refusals are where the contract's single rule —
 * *every forecast must carry confidence intervals, declare its assumptions, express its uncertainty, and be
 * reproducible and versioned* — stops being a policy and becomes arithmetic nobody can route around:
 *
 * - {@link HorizonExceedsHistoryError} is {@link MAX_HORIZON_RATIO} refusing. It is the one error in this file
 *   that no configuration, no tenant setting and no override can suppress, because the pressure to reach further
 *   than the history supports is exactly proportional to how badly the answer is wanted.
 * - {@link UndeclaredAssumptionsError} means a run cannot be produced on a set of assumptions that does not say
 *   what it rests on. A forecast published without them reads as though it depends on nothing.
 * - {@link MissingRequiredIntervalError} means a point cannot reach the record without the interval the contract
 *   demands. It should be unreachable through the engines; it exists so that a future caller assembling points by
 *   hand fails loudly rather than publishing a bare number wearing a forecast's authority.
 * - {@link PublishedModelImmutableError} and {@link RunNotReproducibleError} are the versioning half. A published
 *   method is frozen because every run that pinned it must keep meaning what it meant, and a run whose inputs
 *   have moved underneath it is marked rather than corrected.
 *
 * A refusal here is a 409 or a 422 carrying the specifics an operator needs to fix it, because these are the
 * platform enforcing its contract — not something going wrong inside it.
 */

// --- Directories -----------------------------------------------------------------

/** The organization (institution node, P2-D01-M01) that would own this record does not exist. */
export class OrganizationNotFoundForForecastError extends PlatformError {
  constructor(organizationId: string) {
    super(`Organization "${organizationId}" not found; cannot attach the forecast record to it`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { organizationId },
    });
  }
}

/**
 * A person named on the record — an assumption's holder, a plan's owner, a reviewer — is not in this tenant.
 *
 * The assumption case is the one that matters. `expert_judgement` means a named person's judgement or it means
 * nothing, and an assumption attributed to an id that resolves to nobody is an unattributed belief with a
 * plausible-looking field filled in, which is worse than an empty one because it survives being looked at.
 */
export class PersonNotFoundForForecastError extends PlatformError {
  constructor(personId: string, role: string) {
    super(`No person "${personId}" exists in this tenant; they cannot be the ${role}`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { personId, role },
    });
  }
}

/**
 * A series names a subject in an operational domain that does not have it.
 *
 * This domain never re-models the record it forecasts about — a series' subject is an opaque reference outward,
 * exactly as the knowledge graph's is — so the reference is checked where it is made. A series accumulating
 * observations about a subject that was never there produces a forecast about nothing, and does so silently for
 * as long as nobody thinks to check.
 */
export class SeriesSubjectNotFoundError extends PlatformError {
  constructor(sourceDomain: string, subjectRef: string) {
    super(`No "${sourceDomain}" record "${subjectRef}" exists in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { sourceDomain, subjectRef },
    });
  }
}

// --- Observation series ----------------------------------------------------------

/** The requested observation series does not exist in the current tenant. */
export class ObservationSeriesNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Observation series "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A series is addressed by key, so the key cannot be blank. */
export class EmptySeriesKeyError extends PlatformError {
  constructor() {
    super("An observation series must have a non-empty key", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A series must say what it measures. A series with no metric is a column of numbers. */
export class EmptyMetricKeyError extends PlatformError {
  constructor() {
    super("An observation series must name the metric it measures", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** Series keys are unique within an organization, so a model naming one always means one. */
export class DuplicateSeriesKeyError extends PlatformError {
  constructor(seriesKey: string) {
    super(`Observation series "${seriesKey}" already exists in this organization`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { seriesKey },
    });
  }
}

/**
 * A declared seasonal cycle has to be a whole number of periods and more than one.
 *
 * A cycle of one is not a season, it is the previous period, and a seasonal method configured with it degrades
 * to `naive` while still being reported as seasonal — the specific confusion that makes a seasonal forecast
 * trusted more than it has earned.
 */
export class InvalidCycleLengthError extends PlatformError {
  constructor(cycleLength: number) {
    super(
      `A seasonal cycle of ${String(cycleLength)} is not a cycle; it must be a whole number above 1`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { cycleLength },
      },
    );
  }
}

/** An observation's period is an integer index on the series' grid; a fraction indexes nothing. */
export class InvalidObservationPeriodError extends PlatformError {
  constructor(period: number) {
    super(`Observation period ${String(period)} is not a whole index on the series grid`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { period },
    });
  }
}

/**
 * An observed value must be a finite number. `NaN` and the infinities propagate silently through every mean,
 * spread and interval downstream, so a whole forecast comes back numerically meaningless with no indication of
 * which observation did it. Refusing at the point of entry is the only place the answer is still cheap.
 */
export class NonFiniteObservationError extends PlatformError {
  constructor(period: number) {
    super(`The observation at period ${String(period)} is not a finite value`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { period },
    });
  }
}

/**
 * The series has been closed and takes no further observations.
 *
 * A closed series can still be forecast *from* — the runs that pinned it have to stay reproducible — but it has
 * stopped being a record of an ongoing thing, and appending to one is almost always a sign that a discontinued
 * metric is still being collected under a name that no longer means what it used to.
 */
export class SeriesClosedError extends PlatformError {
  constructor(id: string) {
    super(`Observation series "${id}" is closed and takes no further observations`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/**
 * That period has already been observed. A restatement is a correction, and a correction is a different act.
 *
 * The distinction is load-bearing rather than pedantic. A correction bumps the series version, which is what
 * every run that pinned this series compares against when it checks whether it still reproduces; an append that
 * quietly overwrote a value would move the numbers under a published forecast and leave the drift check with
 * nothing to notice.
 */
export class ObservationAlreadyRecordedError extends PlatformError {
  constructor(seriesKey: string, period: number) {
    super(`Series "${seriesKey}" already has an observation at period ${String(period)}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { seriesKey, period },
    });
  }
}

/** There is nothing at that period to correct. */
export class ObservationNotFoundError extends PlatformError {
  constructor(seriesKey: string, period: number) {
    super(`Series "${seriesKey}" has no observation at period ${String(period)}`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { seriesKey, period },
    });
  }
}

/** The attempted series transition is not allowed from where the series currently stands. */
export class InvalidSeriesTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`An observation series cannot go from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

// --- Forecast models -------------------------------------------------------------

/** The requested forecast model version does not exist in the current tenant. */
export class ForecastModelNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Forecast model "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A model is addressed by key across its versions, so the key cannot be blank. */
export class EmptyModelKeyError extends PlatformError {
  constructor() {
    super("A forecast model must have a non-empty key", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A model must have a name the people relying on its numbers can recognise it by. */
export class EmptyModelNameError extends PlatformError {
  constructor() {
    super("A forecast model must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** That version of this model key already exists; a revision takes the next version number. */
export class DuplicateModelVersionError extends PlatformError {
  constructor(modelKey: string, version: number) {
    super(`Forecast model "${modelKey}" already has a version ${String(version)}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { modelKey, version },
    });
  }
}

/**
 * A projection parameter is outside the band its method can read — a smoothing factor outside (0, 1], a moving
 * average window below one period.
 *
 * Clamping instead would be the tempting choice and the wrong one. A run pins the parameters it used, so a
 * silently clamped value produces a forecast whose recorded configuration is not the configuration that made it,
 * and the reproducibility digest would then agree with a set of inputs that never ran.
 */
export class InvalidModelParameterError extends PlatformError {
  constructor(parameter: string, value: number, expected: string) {
    super(`Model parameter "${parameter}" is ${String(value)}; it must be ${expected}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { parameter, value, expected },
    });
  }
}

/**
 * **The versioning half of the rule, as a refusal.** A published model is frozen.
 *
 * Every run that pinned this version recorded the method and parameters it used by reference to it, so editing
 * one in place would rewrite what those runs meant after the institution had already acted on them. Revise it
 * into a new draft version instead — which mints a new number, leaves the old runs intact, and makes the change
 * visible as a change rather than as a discrepancy somebody finds later.
 */
export class PublishedModelImmutableError extends PlatformError {
  constructor(id: string, status: string) {
    super(
      `Forecast model "${id}" is "${status}" and can no longer be edited; revise it into a new version`,
      {
        code: "CONFLICT",
        httpStatus: 409,
        isOperational: true,
        details: { id, status },
      },
    );
  }
}

/** The attempted model transition is not allowed from where the model currently stands. */
export class InvalidModelTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A forecast model cannot go from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** Runs pin a published version only — never a draft, and never a retired one. */
export class ModelNotPublishedError extends PlatformError {
  constructor(id: string, status: string) {
    super(
      `Forecast model "${id}" is "${status}"; runs are produced from a published version only`,
      {
        code: "CONFLICT",
        httpStatus: 409,
        isOperational: true,
        details: { id, status },
      },
    );
  }
}

// --- Forecast runs ---------------------------------------------------------------

/** The requested forecast run does not exist in the current tenant. */
export class ForecastRunNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Forecast run "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/**
 * The series cannot support a forecast at all, and the series engine's issue codes say why.
 *
 * `forecastable` is deliberately not "issue-free": a gap widens the interval and is reported rather than
 * refused. This fires for the failures that leave nothing to compute from — no observations, fewer than the
 * observation floor, values that are not numbers — where a produced forecast would be arithmetic performed on
 * an absence.
 */
export class SeriesNotForecastableError extends PlatformError {
  constructor(seriesKey: string, issues: readonly string[]) {
    super(`Series "${seriesKey}" cannot be forecast from (${issues.join(", ")})`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { seriesKey, issues: [...issues] },
    });
  }
}

/**
 * **The contract rule, as a refusal.** The requested horizon reaches further ahead than the history behind it
 * permits: no forecast may extend past {@link MAX_HORIZON_RATIO} of the observations it was derived from.
 *
 * This is the one refusal in this file that nothing can suppress. There is no tenant setting that raises the
 * ratio, no model parameter that opts out of it, and no scenario that reaches past it, because the classic abuse
 * of a forecasting system is a five-year projection drawn from six months of history and the only defence that
 * holds under pressure is arithmetic that refuses rather than a reviewer who is expected to notice.
 *
 * `maxHorizon` is on the error because the useful reply is not "no" but "six" — the answer the institution can
 * act on without another round trip.
 */
export class HorizonExceedsHistoryError extends PlatformError {
  constructor(horizon: number, maxHorizon: number, observationCount: number) {
    super(
      `A horizon of ${String(horizon)} cannot be forecast from ${String(observationCount)} observations; the furthest admissible horizon is ${String(maxHorizon)}`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { horizon, maxHorizon, observationCount },
      },
    );
  }
}

/**
 * **The second half of the rule, as a refusal.** The run's assumptions do not stand up: none were declared, one
 * names no holder or no reference, a key is duplicated, or the method relies on a belief the set never states.
 *
 * Declaring assumptions is worth something only if a declaration has to name its own grounds, and a forecast
 * published without them reads as though it depends on nothing at all — which is the reading an institution
 * plans against when the assumptions are missing rather than wrong.
 */
export class UndeclaredAssumptionsError extends PlatformError {
  constructor(issues: readonly string[]) {
    super(
      `A forecast cannot be produced under assumptions that do not stand up (${issues.join(", ")})`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { issues: [...issues] },
      },
    );
  }
}

/**
 * **The first half of the rule, as a refusal.** A point reached the run without the required interval.
 *
 * This should be unreachable: the uncertainty engine attaches {@link REQUIRED_CONFIDENCE_LEVEL} to every point
 * it produces, and nothing else in this package hands out a `ForecastPoint`. It is here so that the day somebody
 * assembles points another way, the run refuses to be written rather than publishing a bare number carrying a
 * forecast's authority — the failure the whole first rule exists to prevent.
 */
export class MissingRequiredIntervalError extends PlatformError {
  constructor(period: number, requiredLevel: number) {
    super(
      `The point at period ${String(period)} has no ${String(requiredLevel)}% interval; a forecast cannot be recorded without one`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { period, requiredLevel },
      },
    );
  }
}

/** A run produced no points at all, which is not a forecast of anything. */
export class EmptyForecastError extends PlatformError {
  constructor(seriesKey: string) {
    super(`The forecast of series "${seriesKey}" produced no points`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { seriesKey },
    });
  }
}

/** The attempted run transition is not allowed from where the run currently stands. */
export class InvalidRunTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A forecast run cannot go from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/**
 * A run was asked to be marked as no longer reproducible while it still reproduces exactly.
 *
 * `invalidated` is a serious mark — it says a published forecast has been overtaken by its own inputs — and it
 * is derived from a reproduction check rather than asserted, so that the status always means the check ran and
 * failed. A status somebody could set by hand is a status that stops being evidence of anything.
 */
export class RunStillReproducesError extends PlatformError {
  constructor(id: string) {
    super(
      `Forecast run "${id}" still reproduces from its recorded inputs and cannot be invalidated`,
      {
        code: "CONFLICT",
        httpStatus: 409,
        isOperational: true,
        details: { id },
      },
    );
  }
}

/**
 * The run is not the reproducible, current forecast a downstream act needs.
 *
 * A superseded run has been replaced and an invalidated one no longer reproduces from today's inputs. Both stay
 * on the record exactly as they were — the honest account of a forecast that has been overtaken is the forecast
 * plus the fact that it was overtaken — but neither is something a new simulation or a plan should be built on.
 */
export class RunNotReproducibleError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Forecast run "${id}" is "${status}" and cannot be built on`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

// --- Backtests -------------------------------------------------------------------

/** The requested backtest does not exist in the current tenant. */
export class BacktestNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Backtest "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/**
 * The series cannot afford a holdout: scoring it would either leave the training set below the observation floor
 * or ask for a horizon the remaining history does not support.
 *
 * The alternative — scoring against periods that sat inside the data the forecast was derived from — measures
 * memory rather than prediction while looking entirely rigorous, and a model promoted on that basis has been
 * validated against its own answers.
 */
export class HoldoutTooSmallError extends PlatformError {
  constructor(seriesKey: string, observationCount: number) {
    super(
      `Series "${seriesKey}" has ${String(observationCount)} observations, too few to hold any of them back for scoring`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { seriesKey, observationCount },
      },
    );
  }
}

/**
 * The model has not earned publication: it failed to beat the naive baseline, or its intervals caught materially
 * fewer outcomes than they claimed.
 *
 * Both conditions gate, because either alone can be satisfied by a model that is wrong in a comfortable
 * direction. Overconfident intervals are the one this exists for — narrow ranges look like competence, and a
 * model whose 80% interval catches 40% of outcomes has been telling the institution a comfortable lie in the
 * vocabulary of statistics.
 */
export class ModelNotPublishableError extends PlatformError {
  constructor(modelKey: string, skillScore: number, calibration: string) {
    super(
      `Forecast model "${modelKey}" has not earned publication (skill ${String(skillScore)}, intervals "${calibration}")`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { modelKey, skillScore, calibration },
      },
    );
  }
}

// --- Scenarios -------------------------------------------------------------------

/** The requested scenario does not exist in the current tenant. */
export class ScenarioNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Scenario "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A scenario is addressed by key, so the key cannot be blank. */
export class EmptyScenarioKeyError extends PlatformError {
  constructor() {
    super("A scenario must have a non-empty key", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A scenario put in front of a board must be nameable by the people looking at it. */
export class EmptyScenarioNameError extends PlatformError {
  constructor() {
    super("A scenario must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** Scenario keys are unique within an organization. */
export class DuplicateScenarioKeyError extends PlatformError {
  constructor(scenarioKey: string) {
    super(`Scenario "${scenarioKey}" already exists in this organization`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { scenarioKey },
    });
  }
}

/** A lever is addressed by key within its scenario, so the key cannot be blank. */
export class EmptyLeverKeyError extends PlatformError {
  constructor() {
    super("A scenario lever must have a non-empty key", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/**
 * Two levers answering to one key make the simulation engine's application order ambiguous, and an ambiguous
 * order is the difference between a scenario that reproduces and one that happens to agree with itself today.
 */
export class DuplicateLeverKeyError extends PlatformError {
  constructor(leverKey: string) {
    super(`Scenario lever "${leverKey}" is already part of this scenario`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { leverKey },
    });
  }
}

/** The named lever is not part of this scenario. */
export class LeverNotFoundError extends PlatformError {
  constructor(scenarioId: string, leverKey: string) {
    super(`Lever "${leverKey}" is not part of scenario "${scenarioId}"`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { scenarioId, leverKey },
    });
  }
}

/**
 * The lever cannot move anything: a magnitude that is not finite, a multiplicative or growth factor outside the
 * admissible band, or a starting horizon that is not a whole period at or after the first.
 *
 * The factor band is the interesting one. A what-if is a statement about a plausible future, and past some
 * magnitude the baseline projection has stopped contributing to the answer and the lever simply *is* the answer
 * — at which point the institution is looking at a number somebody chose, presented with a forecast's framing.
 */
export class InadmissibleLeverError extends PlatformError {
  constructor(leverKey: string, kind: string, magnitude: number, fromHorizon: number) {
    super(
      `Lever "${leverKey}" (${kind} ${String(magnitude)} from horizon ${String(fromHorizon)}) cannot be applied`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { leverKey, kind, magnitude, fromHorizon },
      },
    );
  }
}

/**
 * A published scenario is frozen, for the same reason a published model is: the simulations that pinned it have
 * to keep meaning what they meant when a board looked at them. Revise it into a new scenario instead.
 */
export class PublishedScenarioImmutableError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Scenario "${id}" is "${status}" and can no longer be edited`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

/** A scenario that moves nothing is the baseline with a different name on it. */
export class EmptyScenarioError extends PlatformError {
  constructor(id: string) {
    super(`Scenario "${id}" declares no levers and cannot be published`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { id },
    });
  }
}

/** The attempted scenario transition is not allowed from where the scenario currently stands. */
export class InvalidScenarioTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A scenario cannot go from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** Simulations run a published scenario only — never a draft, and never an archived one. */
export class ScenarioNotPublishedError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Scenario "${id}" is "${status}"; only a published scenario may be simulated`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

// --- Simulation runs -------------------------------------------------------------

/** The requested simulation run does not exist in the current tenant. */
export class SimulationRunNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Simulation run "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The attempted simulation transition is not allowed from where the simulation currently stands. */
export class InvalidSimulationTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A simulation run cannot go from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

// --- Strategic plans -------------------------------------------------------------

/** The requested strategic plan does not exist in the current tenant. */
export class StrategicPlanNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Strategic plan "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A plan is addressed by key, so the key cannot be blank. */
export class EmptyPlanKeyError extends PlatformError {
  constructor() {
    super("A strategic plan must have a non-empty key", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A plan an institution operates under must be nameable by the people operating under it. */
export class EmptyPlanNameError extends PlatformError {
  constructor() {
    super("A strategic plan must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** Plan keys are unique within an organization. */
export class DuplicatePlanKeyError extends PlatformError {
  constructor(planKey: string) {
    super(`Strategic plan "${planKey}" already exists in this organization`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { planKey },
    });
  }
}

/** An objective is addressed by key within its plan, so the key cannot be blank. */
export class EmptyObjectiveKeyError extends PlatformError {
  constructor() {
    super("A plan objective must have a non-empty key", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/**
 * An objective names the metric it tracks.
 *
 * Without it an objective is an aim with no measurement behind it — a number somebody committed to that nothing
 * in the institution's data can confirm or refute, which is how a plan ends up being reviewed on opinion.
 */
export class EmptyObjectiveMetricKeyError extends PlatformError {
  constructor() {
    super("A plan objective must name the metric it tracks", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** Two objectives answering to one key make every progress reading ambiguous about what it is a reading of. */
export class DuplicateObjectiveKeyError extends PlatformError {
  constructor(objectiveKey: string) {
    super(`Objective "${objectiveKey}" is already part of this plan`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { objectiveKey },
    });
  }
}

/** The named objective is not part of this plan. */
export class ObjectiveNotFoundError extends PlatformError {
  constructor(planId: string, objectiveKey: string) {
    super(`Objective "${objectiveKey}" is not part of plan "${planId}"`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { planId, objectiveKey },
    });
  }
}

/**
 * An objective's target period must fall after the plan starts.
 *
 * The planning engine draws a straight line from the plan's start to the objective's target period, and a target
 * at or before the start collapses that line to a point: the objective is due immediately, every review scores
 * it against its final target, and an aim the institution was given three years for is reported as failed on the
 * first day. Refusing the configuration is far kinder than explaining the reports it produces.
 */
export class ObjectiveTargetPeriodError extends PlatformError {
  constructor(objectiveKey: string, targetPeriod: number, startPeriod: number) {
    super(
      `Objective "${objectiveKey}" targets period ${String(targetPeriod)}, at or before the plan's start (${String(startPeriod)})`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { objectiveKey, targetPeriod, startPeriod },
      },
    );
  }
}

/**
 * A plan's periods are whole indices on the grid the plan declared.
 *
 * The same rule the observation grid runs on, for the same reason: a period is an index the caller defines, and
 * "period 2.5" names nothing a review could ever be taken at. The trajectory arithmetic would accept it happily
 * and produce an expected value nobody can reconcile against a reading, so the refusal happens here, where the
 * fractional index is still visibly a caller's mistake rather than an unexplained figure in a board paper.
 */
export class InvalidPlanPeriodError extends PlatformError {
  constructor(field: string, period: number) {
    super(`Plan ${field} ${String(period)} is not a whole index on the plan's grid`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field, period },
    });
  }
}

/** An objective's baseline, target and every reading against it must be finite numbers. */
export class NonFiniteObjectiveValueError extends PlatformError {
  constructor(objectiveKey: string, field: string) {
    super(`Objective "${objectiveKey}" has a non-finite ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { objectiveKey, field },
    });
  }
}

/** A plan committing an institution to nothing is not a plan it can be held to. */
export class PlanWithoutObjectivesError extends PlatformError {
  constructor(id: string) {
    super(`Strategic plan "${id}" declares no objectives and cannot be activated`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { id },
    });
  }
}

/**
 * An active plan's objectives are fixed.
 *
 * Adding an aim to a plan already being reported on rewrites its history: every review taken before the addition
 * scored a plan that did not contain it, and the variance series an institution has been watching stops being
 * a series about one thing. Removing one is worse — the commonest way a plan reports itself healthy is that the
 * objective it was failing stopped being part of it.
 */
export class ActivePlanObjectivesFrozenError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Strategic plan "${id}" is "${status}"; its objectives can no longer be changed`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

/** Progress is recorded against a plan the institution is actually operating under. */
export class PlanNotActiveError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Strategic plan "${id}" is "${status}" and is not being operated under`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

/**
 * A review names the person who took it. A plan review is the institution putting a number on its own progress,
 * and an unattributed one is a figure that appeared in a report with nobody behind it — which is precisely the
 * reading a leadership team will not question.
 */
export class AnonymousPlanReviewError extends PlatformError {
  constructor(action: string) {
    super(`A plan cannot be ${action} without naming the person accountable for it`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { action },
    });
  }
}

/** The attempted plan transition is not allowed from where the plan currently stands. */
export class InvalidPlanTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A strategic plan cannot go from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}
