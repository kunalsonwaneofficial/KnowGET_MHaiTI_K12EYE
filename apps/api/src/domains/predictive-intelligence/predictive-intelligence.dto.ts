import { z } from "zod";

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);
const nullableText = z.string().nullable();

/**
 * A period index on the series grid, and the one primitive worth spelling out. Periods are integers on a grid
 * whose origin the series declares — not dates — because the engines never resample and never convert between
 * grains, so a calendar value arriving here would have to be interpreted, and interpreting it is a modelling
 * decision this layer has no business making. Negative indices are admissible: history recorded backwards from
 * an established origin is ordinary, and refusing it here would push institutions into renumbering their past.
 */
const periodIndex = z.number().int();
const finite = z.number().finite();
const positiveInt = z.number().int().positive();

const metricDirection = z.enum(["higher_is_better", "lower_is_better", "neutral"]);
const periodGrain = z.enum(["day", "week", "month", "term", "year"]);
const forecastMethod = z.enum([
  "naive",
  "drift",
  "moving_average",
  "linear_trend",
  "seasonal_naive",
  "exponential_smoothing",
]);
const assumptionKind = z.enum([
  "continuity",
  "exogenous",
  "policy",
  "capacity",
  "data_quality",
  "seasonality",
]);
const assumptionBasis = z.enum([
  "observed_history",
  "declared_policy",
  "expert_judgement",
  "upstream_forecast",
]);
const leverKind = z.enum(["additive", "multiplicative", "override", "growth_rate"]);

/**
 * The admissible confidence levels, as a closed set rather than an open integer. A caller asking for a 99%
 * interval is not asking for a slightly different number — the quantile multipliers are a fixed table and
 * there is no entry to read — so the honest answer is a rejected request rather than a silently substituted
 * level. The domain re-adds the required 80% band whatever arrives here, so an omission cannot produce a
 * model whose runs would lack the interval that makes them forecasts.
 */
const confidenceLevel = z.union([z.literal(50), z.literal(80), z.literal(95)]);

/**
 * Only the parameters the methods actually read. Which ones apply is decided by the method, and supplying a
 * window to an exponential smoother is refused by the domain rather than ignored here — a parameter that had
 * no effect is a misunderstanding about the model, and a forecast produced from a misunderstanding reproduces
 * perfectly while meaning something other than what its author intended.
 */
const projectionParameters = z.object({
  windowSize: positiveInt.optional(),
  alpha: z.number().optional(),
});

// --- Observation series (forecast:record) ----------------------------------------

export const declareSeriesSchema = z.object({
  organizationId: uuid,
  seriesKey: nonEmpty,
  metricKey: nonEmpty,
  sourceDomain: nonEmpty,
  subjectRef: nullableText.optional(),
  grain: periodGrain,
  direction: metricDirection,
  cycleLength: positiveInt.nullable().optional(),
  unit: nullableText.optional(),
});

/** Declaring seasonality, or declaring that there is none. `null` is a statement, not an omission. */
export const declareCycleSchema = z.object({ cycleLength: positiveInt.nullable() });

const observation = z.object({
  period: periodIndex,
  value: finite,
  label: nonEmpty,
});

/** One observation as the wire carries it, before the series normalizes and accepts it. */
export type ObservationInputDto = z.infer<typeof observation>;

/**
 * A batch is validated whole and applied whole, so this is one act on the series and advances its version
 * once. The array is deliberately unconstrained at the edge: an empty batch is a no-op the domain already
 * returns unchanged, and a duplicate period is the domain's refusal to state, not zod's.
 */
export const recordObservationsSchema = z.object({ observations: z.array(observation) });

/** A restatement. The label is optional because correcting a figure rarely renames the period it sits at. */
export const correctObservationSchema = z.object({
  period: periodIndex,
  value: finite,
  label: nonEmpty.optional(),
});

export const withdrawObservationSchema = z.object({ period: periodIndex });

// --- Forecast models (forecast:manage) -------------------------------------------

export const draftModelSchema = z.object({
  organizationId: uuid,
  modelKey: nonEmpty,
  name: nonEmpty,
  description: nullableText.optional(),
  method: forecastMethod,
  parameters: projectionParameters.optional(),
  confidenceLevels: z.array(confidenceLevel).optional(),
});

/**
 * What may be changed about a method. Shared by amending a draft in place and by revising a published version
 * into a new one — the same fields either way, because a revision that could change things an amendment could
 * not would make the version boundary a loophole rather than a freeze.
 */
export const amendModelSchema = z.object({
  name: nonEmpty.optional(),
  description: nullableText.optional(),
  method: forecastMethod.optional(),
  parameters: projectionParameters.optional(),
  confidenceLevels: z.array(confidenceLevel).optional(),
});

/**
 * Publication cites the backtest that earned it. The domain loads that backtest and refuses one that did not
 * beat carrying the last figure forward, so this field is the evidence for a claim rather than a reference
 * for the record — which is why publication takes a body at all instead of being a bare POST.
 */
export const publishModelSchema = z.object({
  backtestId: uuid,
  version: positiveInt.optional(),
});

// --- Forecast runs (forecast:operate) --------------------------------------------

/**
 * One declared belief the forecast stands on. `holderId` and `reference` are optional here and mandatory in
 * the domain for the bases that require them: an `expert_judgement` with nobody's name on it is refused
 * rather than recorded as anonymous, and an `upstream_forecast` that names no upstream record cannot be
 * followed back. What arrives without either is not corrected — it is rejected with the basis quoted.
 */
const assumption = z.object({
  assumptionKey: nonEmpty,
  kind: assumptionKind,
  basis: assumptionBasis,
  holderId: nullableText.optional(),
  reference: nullableText.optional(),
  expectedValue: finite.nullable().optional(),
});

/** One assumption as the wire carries it, before the run pins it. */
export type AssumptionInputDto = z.infer<typeof assumption>;

/**
 * Producing a forecast. At least one assumption is required at the edge as well as in the domain, because an
 * empty array is the one malformed request a caller is most likely to send by accident and the clearest one
 * to name: a projection standing on no declared grounds is not a weaker forecast, it is an undeclared one.
 */
export const produceForecastSchema = z.object({
  seriesId: uuid,
  modelId: uuid,
  horizon: positiveInt,
  assumptions: z.array(assumption).min(1),
});

/**
 * Retiring a run in favour of another. Shared by forecast runs and simulation runs — both are born completed,
 * neither is ever edited, and superseding either is the same act of pointing at what replaced it.
 */
export const supersedeRunSchema = z.object({ replacementRunId: uuid });

// --- Backtests (forecast:operate) ------------------------------------------------

/**
 * Scoring a method against history it was not fitted on. Omitting the holdout takes the largest honest one
 * the series can support, which is the right default: a caller who picks the holdout picks how flattering the
 * score is, and the least interesting way to pass a backtest is to hold out almost nothing.
 */
export const runBacktestSchema = z.object({
  seriesId: uuid,
  modelId: uuid,
  holdoutSize: positiveInt.optional(),
});

// --- Scenarios (forecast:manage) -------------------------------------------------

const lever = z.object({
  leverKey: nonEmpty,
  kind: leverKind,
  magnitude: finite,
  fromHorizon: positiveInt.optional(),
  assumptionKey: nullableText.optional(),
});

/** One lever as the wire carries it, before the scenario admits it. */
export type LeverInputDto = z.infer<typeof lever>;

export const declareScenarioSchema = z.object({
  organizationId: uuid,
  scenarioKey: nonEmpty,
  name: nonEmpty,
  description: nullableText.optional(),
  levers: z.array(lever).optional(),
});

export const amendScenarioSchema = z.object({
  name: nonEmpty.optional(),
  description: nullableText.optional(),
});

/**
 * Revising a published case into a new one. The key is required and is not the old key: a published scenario
 * is frozen because outcomes cite it, so what a revision produces is a sibling case under its own key rather
 * than a second edition of a case the record already refers to.
 */
export const reviseScenarioSchema = z.object({
  scenarioKey: nonEmpty,
  name: nonEmpty.optional(),
  description: nullableText.optional(),
});

export const addLeversSchema = z.object({ levers: z.array(lever) });

/** The key is a lever's identity and is therefore absent here — it is in the path, and it is not amendable. */
export const amendLeverSchema = z.object({
  kind: leverKind.optional(),
  magnitude: finite.optional(),
  fromHorizon: positiveInt.optional(),
  assumptionKey: nullableText.optional(),
});

// --- Simulation runs (forecast:operate) ------------------------------------------

/**
 * Running a published case against a standing forecast. Nothing about the projection is restated here: the
 * baseline is loaded by id and re-verified before a single lever is applied, so a simulation cannot quietly
 * depart from numbers other than the ones the institution actually published.
 */
export const produceSimulationSchema = z.object({
  scenarioId: uuid,
  forecastRunId: uuid,
});

// --- Strategic plans (forecast:plan) ---------------------------------------------

const objective = z.object({
  objectiveKey: nonEmpty,
  metricKey: nonEmpty,
  direction: metricDirection,
  baselineValue: finite,
  targetValue: finite,
  targetPeriod: periodIndex,
});

/** One objective as the wire carries it, before the plan accepts it against its own start period. */
export type ObjectiveInputDto = z.infer<typeof objective>;

export const draftPlanSchema = z.object({
  organizationId: uuid,
  planKey: nonEmpty,
  name: nonEmpty,
  description: nullableText.optional(),
  startPeriod: periodIndex,
  objectives: z.array(objective).optional(),
});

export const amendPlanSchema = z.object({
  name: nonEmpty.optional(),
  description: nullableText.optional(),
});

export const addObjectivesSchema = z.object({ objectives: z.array(objective) });

/** The key is in the path. Everything else about an objective may be restated while the plan is still a draft. */
export const amendObjectiveSchema = z.object({
  metricKey: nonEmpty.optional(),
  direction: metricDirection.optional(),
  baselineValue: finite.optional(),
  targetValue: finite.optional(),
  targetPeriod: periodIndex.optional(),
});

const progressReading = z.object({
  objectiveKey: nonEmpty,
  period: periodIndex,
  actualValue: finite,
});

/** One reading as the wire carries it, before the plan matches it to an objective it actually declared. */
export type ProgressInputDto = z.infer<typeof progressReading>;

export const recordProgressSchema = z.object({ readings: z.array(progressReading) });

/**
 * A review at a period. The variance is computed by the domain and kept, and is deliberately not accepted
 * from the body: a review whose caller supplied its own account of the gap would record the caller's reading
 * of the plan rather than the plan's reading of itself, which is the one thing a review exists to prevent.
 * The reviewer is the principal, never the body.
 */
export const reviewPlanSchema = z.object({
  period: periodIndex,
  note: nullableText.optional(),
});

/** Abandoning names why. Optional at the edge and nullable in the domain, so silence is recorded as silence. */
export const abandonPlanSchema = z.object({ reason: nullableText.optional() });
