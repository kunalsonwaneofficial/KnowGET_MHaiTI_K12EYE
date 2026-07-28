import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { ConfidenceLevel, ForecastMethod, RunStatus } from "./forecast-value";
import {
  REQUIRED_CONFIDENCE_LEVEL,
  isHorizonAdmissible,
  maxHorizonFor,
  normalizeAssumptionKey,
} from "./forecast-value";
import type {
  AssumptionIssue,
  AssumptionView,
  DriftCode,
  ForecastPoint,
  ProjectionPoint,
  ReproducibilityInputs,
  ReproductionResult,
  ResolvedProjectionParameters,
  UncertaintyAssessment,
} from "./forecast-view";
import {
  EmptyForecastError,
  HorizonExceedsHistoryError,
  InvalidRunTransitionError,
  MissingRequiredIntervalError,
  RunNotReproducibleError,
  RunStillReproducesError,
  SeriesNotForecastableError,
  UndeclaredAssumptionsError,
} from "./errors";
import { assumptionKeysOf, inspectAssumptions } from "./assumptions";
import type { ForecastModel } from "./forecast-model";
import { requirePublishedModel } from "./forecast-model";
import type { ObservationSeries } from "./observation-series";
import { toSeriesView } from "./observation-series";
import { project } from "./projection";
import { reproduce, reproducibilityKeyOf } from "./reproducibility";
import { computeStatistics, inspectSeries } from "./series";
import { assessUncertainty, attachIntervals, spreadFor, summarizeResiduals } from "./uncertainty";

/**
 * **A forecast, as the platform states one.** The four halves of the contract's rule in a single record: the
 * points with their intervals, the assumptions they stand on, the uncertainty they were graded at, and enough
 * pinned input to produce them again.
 *
 * A run is the only thing this package will publish, and it is deliberately not a row somebody assembles. There
 * is one constructor, {@link produceForecastRun}, it computes rather than accepts every derived field, and the
 * inputs it pins are the ones the arithmetic actually read. A caller cannot hand it points, cannot hand it a
 * digest, cannot hand it an uncertainty grade, and cannot hand it a tenant that disagrees with the series it
 * forecast — those are all derived here, because each of them is a claim somebody would otherwise be able to
 * make on the platform's behalf without the platform having checked it.
 *
 * **The digest is self-consistent by construction.** The pinned fields are built once, digested, and spread into
 * the run, so {@link runInputs} regenerates exactly what {@link reproducibilityKeyOf} hashed. Building the input
 * record twice — once for the hash and once for the reader — is the obvious implementation and it is the one
 * that eventually drifts: a field added to the run and not to the hash, or rendered differently in the two
 * places, and the digest quietly starts attesting to something other than what produced the numbers. That is the
 * single failure the whole reproducibility engine exists to catch, so it is the single one that must not be
 * possible here.
 *
 * **Resolved parameters are what get pinned, not requested ones.** {@link resolveParameters} clamps a window to
 * what the history can support and fills in defaults, and it is the clamped, filled-in values that determined
 * the answer. Pinning the model's partial request would record an input the arithmetic never used and omit the
 * one it did.
 *
 * **Invalidation requires evidence about this run.** {@link invalidateRun} takes the recomputation and checks it
 * here rather than trusting a caller's verdict, so a run cannot be marked unreproducible on the strength of some
 * other run's failure, or on nothing at all. `invalidated` says a published forecast has been overtaken by its
 * own inputs; a status somebody could set by hand would make it worthless, and worse than worthless once
 * leadership had learned to act on it.
 *
 * Nothing about a run is mutable except its status. A correction to the series or a retune of the model does not
 * edit the run — it produces a new one, and {@link supersedeRun} records which. What the institution said in
 * March stays exactly as it said it, which is the difference between a forecast record and a forecast.
 */

// --- The aggregate ---------------------------------------------------------------

export interface ForecastRun {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly seriesId: Uuid;
  /** Pinned from the series. Digested, so a re-run against a different series is a different run. */
  readonly seriesKey: string;
  /** The series' version at the moment it was read. What makes "these observations" identifiable later. */
  readonly seriesVersion: number;
  readonly modelId: Uuid;
  readonly modelKey: string;
  /** The model's version. A published model is frozen, so this pins the method and its parameters. */
  readonly modelVersion: number;
  readonly method: ForecastMethod;
  /** As resolved by the projection engine — defaults applied, clamps taken — never as requested. */
  readonly parameters: ResolvedProjectionParameters;
  readonly horizon: number;
  readonly confidenceLevels: readonly ConfidenceLevel[];
  /** The declared grounds, keys normalized. Digested by key, so a run under other grounds is another run. */
  readonly assumptions: readonly AssumptionView[];
  /** The forecast itself. Never empty, and every point carries {@link REQUIRED_CONFIDENCE_LEVEL}. */
  readonly points: readonly ForecastPoint[];
  readonly uncertainty: UncertaintyAssessment;
  /** Future periods where the method had nothing to read and the last observed value stood in. */
  readonly fallbackPeriods: readonly number[];
  readonly digest: string;
  /** The string the digest was taken over. Kept beside it so a disagreement is a diff, not a mystery. */
  readonly canonical: string;
  readonly status: RunStatus;
  /** Who produced it. Null for a scheduled run nobody personally stands behind. */
  readonly producedByUserId: Uuid | null;
  /** When the forecast was made. Never moves; {@link ForecastRun.updatedAt} moves with the status. */
  readonly producedAt: ISODateString;
  readonly supersededByRunId: Uuid | null;
  readonly supersededAt: ISODateString | null;
  readonly invalidatedAt: ISODateString | null;
  /** What had moved when the run was invalidated. Empty until then. */
  readonly invalidationDrift: readonly DriftCode[];
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface ForecastRunParams {
  /** Read whole. The run's tenant, organization and pinned history all come from here. */
  readonly series: ObservationSeries;
  /** Must be published: an unpublished model is not frozen, so a run pinning it could not be reproduced. */
  readonly model: ForecastModel;
  readonly horizon: number;
  readonly assumptions: readonly AssumptionView[];
  readonly producedByUserId?: Uuid | null;
}

/**
 * The fields the digest is taken over, in the exact shape the run stores them.
 *
 * Private and unexported on purpose. It exists so the factory and {@link runInputs} cannot disagree about what
 * was pinned — the factory digests this object and then spreads the same object into the run — and exporting it
 * would invite a caller to assemble one, which is the door this design closes.
 */
type PinnedInputs = Pick<
  ForecastRun,
  | "seriesKey"
  | "seriesVersion"
  | "modelKey"
  | "modelVersion"
  | "method"
  | "parameters"
  | "horizon"
  | "confidenceLevels"
  | "assumptions"
>;

// --- Production ------------------------------------------------------------------

/**
 * Produce a forecast run — the one way a {@link ForecastRun} comes into existence.
 *
 * The order of the refusals is the order a reader would want them in: the model must be publishable-from before
 * the series is examined, the series must be forecastable before a horizon against it means anything, and the
 * horizon must be admissible before assumptions are worth collecting. Each error names what to fix and nothing
 * else, so an integrator never fixes two things to discover a third.
 *
 * Tenant and organization are taken from the series rather than accepted, which makes "the run says tenant A
 * while the history it forecast says tenant B" unrepresentable rather than merely validated against.
 *
 * The future points carry no labels, and that is correct rather than missing. A label is what the institution
 * calls a period it has observed; period 41 has not happened, so it renders as `P41` until an observation
 * arrives to name it. Inventing `2026-06` here would require this package to own a calendar, which is precisely
 * what it refuses to do.
 */
export function produceForecastRun(params: ForecastRunParams): ForecastRun {
  const { series, model, horizon } = params;
  requirePublishedModel(model);

  const view = toSeriesView(series);
  const inspection = inspectSeries(view);
  if (!inspection.forecastable) {
    throw new SeriesNotForecastableError(series.seriesKey, inspection.issues);
  }
  if (!isHorizonAdmissible(horizon, inspection.count)) {
    throw new HorizonExceedsHistoryError(
      horizon,
      maxHorizonFor(inspection.count),
      inspection.count,
    );
  }

  const assumptions = normalizeAssumptions(params.assumptions);
  const inspected = inspectAssumptions(assumptions, model.method, series.cycleLength);
  if (!inspected.complete) {
    throw new UndeclaredAssumptionsError(blockingIssues(inspected.issues).map(describeIssue));
  }

  const projection = project(
    model.method,
    view.observations,
    horizon,
    model.parameters,
    series.cycleLength,
  );
  const residuals = summarizeResiduals(projection.fitted);
  const statistics = computeStatistics(view.observations);
  const points = attachIntervals(
    projection.points,
    spreadFor(residuals, statistics.meanAbsoluteChange),
    model.confidenceLevels,
  );
  guardForecast(series.seriesKey, points);

  const pinned: PinnedInputs = {
    seriesKey: series.seriesKey,
    seriesVersion: series.version,
    modelKey: model.modelKey,
    modelVersion: model.version,
    method: model.method,
    parameters: projection.parameters,
    horizon,
    confidenceLevels: model.confidenceLevels,
    assumptions,
  };
  const key = reproducibilityKeyOf(inputsOf(pinned));

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: series.tenantId,
    organizationId: series.organizationId,
    seriesId: series.id,
    modelId: model.id,
    ...pinned,
    points,
    uncertainty: assessUncertainty({
      method: model.method,
      inspection,
      statistics,
      residuals,
      horizon,
      points,
    }),
    fallbackPeriods: projection.fallbackPeriods,
    digest: key.digest,
    canonical: key.canonical,
    status: "completed",
    producedByUserId: params.producedByUserId ?? null,
    producedAt: now,
    supersededByRunId: null,
    supersededAt: null,
    invalidatedAt: null,
    invalidationDrift: [],
    createdAt: now,
    updatedAt: now,
  };
}

// --- Lifecycle -------------------------------------------------------------------

/**
 * Record that a newer run has replaced this one.
 *
 * Only a `completed` run may be superseded. Superseding an already-superseded run would leave two claims about
 * which forecast replaced it, and superseding an `invalidated` one would file a defect away as routine
 * succession — the mark exists to stay visible, and a chain of replacements is exactly how it would stop being.
 */
export function supersedeRun(run: ForecastRun, replacementRunId: Uuid): ForecastRun {
  if (run.status !== "completed") throw new InvalidRunTransitionError(run.status, "superseded");
  return touch(run, {
    status: "superseded",
    supersededByRunId: replacementRunId,
    supersededAt: nowIso(),
  });
}

/**
 * Mark a run as no longer reproducing from its own recorded inputs, on evidence.
 *
 * The recomputation is passed in and checked here rather than a verdict being accepted, so the evidence is
 * necessarily derived from *this* run's pinned inputs and cannot be another run's failure or an assertion. A run
 * that still reproduces is refused with {@link RunStillReproducesError}, which keeps `invalidated` meaning the
 * one thing it is supposed to mean.
 *
 * Allowed from `superseded` as well as `completed`, because reproducibility is a fact about a record rather than
 * about whether that record is current. A superseded forecast is still on the institution's file, still cited in
 * whatever decision it informed, and still owes an honest answer to "does this reproduce".
 */
export function invalidateRun(
  run: ForecastRun,
  recomputed: ReproducibilityInputs,
  recomputedPoints: readonly (ForecastPoint | ProjectionPoint)[],
): ForecastRun {
  if (run.status === "invalidated") throw new InvalidRunTransitionError(run.status, "invalidated");

  const verdict = verifyRun(run, recomputed, recomputedPoints);
  if (verdict.reproducible) throw new RunStillReproducesError(run.id);

  return touch(run, {
    status: "invalidated",
    invalidatedAt: nowIso(),
    invalidationDrift: verdict.drift,
  });
}

// --- Guards ----------------------------------------------------------------------

/**
 * Refuse anything but a run that can still be built on.
 *
 * What a scenario calls before pinning a run as its baseline. Superseded is refused alongside invalidated: a
 * what-if computed against a forecast the institution has already replaced is a plan against a past it has
 * moved on from, and it will be read as a plan against the present.
 */
export function requireReproducibleRun(run: ForecastRun): ForecastRun {
  if (run.status !== "completed") throw new RunNotReproducibleError(run.id, run.status);
  return run;
}

/**
 * Refuse a forecast that would be missing what makes it one.
 *
 * Both checks are unreachable through the constructor as it stands — {@link attachIntervals} is the only
 * construction of a {@link ForecastPoint} in this package and it always includes the required level, and an
 * admissible horizon against a forecastable series always projects at least one point. They stay because
 * "unreachable" is a property of today's call graph rather than of the type, and the day one of them becomes
 * reachable is the day a forecast without an interval reaches an institution.
 */
function guardForecast(seriesKey: string, points: readonly ForecastPoint[]): void {
  if (points.length === 0) throw new EmptyForecastError(seriesKey);
  for (const point of points) {
    const required = point.intervals.find(
      (interval) => interval.level === REQUIRED_CONFIDENCE_LEVEL,
    );
    if (required === undefined) {
      throw new MissingRequiredIntervalError(point.period, REQUIRED_CONFIDENCE_LEVEL);
    }
  }
}

// --- Internals -------------------------------------------------------------------

const touch = (run: ForecastRun, patch: Partial<ForecastRun>): ForecastRun => ({
  ...run,
  ...patch,
  updatedAt: nowIso(),
});

/** Normalize the keys a run will be digested by, so two spellings of one assumption are one assumption. */
const normalizeAssumptions = (assumptions: readonly AssumptionView[]): readonly AssumptionView[] =>
  assumptions.map((assumption) => ({
    ...assumption,
    assumptionKey: normalizeAssumptionKey(assumption.assumptionKey),
  }));

/**
 * Only the issues that actually block a run.
 *
 * `contradictory_assumptions` is a reported suspicion rather than a gate — the assumption engine says so, and it
 * says why — so listing it in the refusal would send a reader off to reconcile two figures that were never the
 * reason. They would fix it and the run would fail again on the real cause.
 */
const blockingIssues = (issues: readonly AssumptionIssue[]): readonly AssumptionIssue[] =>
  issues.filter((issue) => issue.code !== "contradictory_assumptions");

const describeIssue = (issue: AssumptionIssue): string =>
  issue.assumptionKey === null ? issue.code : `${issue.code} (${issue.assumptionKey})`;

/** The pinned fields as the reproducibility engine reads them. The one place the two shapes are bridged. */
const inputsOf = (pinned: PinnedInputs): ReproducibilityInputs => ({
  seriesKey: pinned.seriesKey,
  seriesVersion: pinned.seriesVersion,
  modelKey: pinned.modelKey,
  modelVersion: pinned.modelVersion,
  method: pinned.method,
  parameters: pinned.parameters,
  horizon: pinned.horizon,
  confidenceLevels: pinned.confidenceLevels,
  assumptionKeys: assumptionKeysOf(pinned.assumptions),
});

// --- Reading ---------------------------------------------------------------------

/**
 * The inputs this run pinned, in the form that produced its digest.
 *
 * `reproducibilityKeyOf(runInputs(run)).digest === run.digest` holds for every run this package produced, and a
 * run where it does not is a corrupted record rather than a drifted one.
 */
export const runInputs = (run: ForecastRun): ReproducibilityInputs => inputsOf(run);

/**
 * Recompute the verdict on whether this run still reproduces.
 *
 * Read-only: it says what is true, and {@link invalidateRun} is what acts on it. Separating them means an
 * operator can check a run — routinely, in bulk, on a schedule — without any risk that checking changes it.
 */
export const verifyRun = (
  run: ForecastRun,
  recomputed: ReproducibilityInputs,
  recomputedPoints: readonly (ForecastPoint | ProjectionPoint)[],
): ReproductionResult => reproduce(runInputs(run), run.points, recomputed, recomputedPoints);

/** The point at a given horizon, or `null` where the run did not reach that far. */
export const pointAtHorizon = (run: ForecastRun, horizon: number): ForecastPoint | null =>
  run.points.find((point) => point.horizon === horizon) ?? null;

/** Whether this run is still the institution's current answer for its series. */
export const isRunCurrent = (run: ForecastRun): boolean => run.status === "completed";

/** How anything downstream refers to this run: its id and the digest that identifies its inputs. */
export const runReference = (run: ForecastRun): { runId: Uuid; digest: string } => ({
  runId: run.id,
  digest: run.digest,
});
