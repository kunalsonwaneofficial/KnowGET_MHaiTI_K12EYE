import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { ForecastMethod, SimulationStatus, UncertaintyGrade } from "./forecast-value";
import { roundValue } from "./forecast-value";
import type { LeverView, SimulationOutcome, SimulationPoint } from "./forecast-view";
import { InvalidSimulationTransitionError } from "./errors";
import type { ForecastRun } from "./forecast-run";
import { requireReproducibleRun } from "./forecast-run";
import type { Scenario } from "./scenario";
import { requirePublishedScenario, variedAssumptionKeys } from "./scenario";
import { simulate } from "./simulation";

/**
 * A what-if the institution actually asked, frozen with everything needed to read it years later.
 *
 * The engine in `./simulation` computes a scenario against a baseline and returns an answer. This record is what
 * makes that answer an institutional fact rather than a screen somebody looked at: it pins *which* scenario, at
 * *which* version of its lever set, against *which* forecast run, identified by that run's own input digest —
 * and then keeps the whole outcome, baseline values included, so the comparison survives every one of those
 * inputs moving on afterwards.
 *
 * **The baseline must be the institution's current answer at the moment of running.** {@link requireReproducibleRun}
 * refuses a superseded or invalidated forecast, and the refusal is the point. A what-if computed against a
 * forecast that has already been replaced is a plan against a past the institution has moved on from, and it
 * will be read — in a board pack, six months later, beside current figures — as a plan against the present.
 *
 * **The scenario must be published.** A draft's levers can change under a run that has already cited them, which
 * would leave a recorded outcome whose stated configuration no longer produced it. Publication freezes the lever
 * set and `scenarioVersion` records which one was frozen, so a scenario that is later revised produces a new
 * scenario under a new key rather than quietly redefining what this run meant.
 *
 * **Uncertainty is inherited and never improved.** It arrives from the baseline's grade through
 * {@link simulate} and is stored unchanged. A simulation is a forecast plus a set of assumed movements; nothing
 * in choosing the movements can make the underlying projection more certain than it was, and the failure this
 * prevents — a tidy what-if on an `unusable` forecast, presented as though the levers had settled the question —
 * is the specific way a scenario becomes more dangerous than the forecast beneath it.
 *
 * **A lever that reached nothing is recorded, not thrown.** `unappliedLeverKeys` survives onto the record, so a
 * run whose configuration was partly ineffective says so on its face rather than presenting a smaller movement
 * than intended as the answer to the question that was asked.
 *
 * The outcome is immutable once written. Re-running under a newer baseline produces a new record and
 * {@link supersedeSimulationRun} links the two, because what the institution modelled at the time it decided
 * something does not change when the forecast beneath it does.
 */

// --- The aggregate ---------------------------------------------------------------

export interface SimulationRun {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly scenarioId: Uuid;
  readonly scenarioKey: string;
  /** The lever-set version pinned at publication. A revised scenario is a different scenario, not a later one. */
  readonly scenarioVersion: number;
  readonly forecastRunId: Uuid;
  /** The baseline's input digest. Identifies *what was forecast* even after that run is superseded. */
  readonly forecastRunDigest: string;
  readonly seriesKey: string;
  readonly seriesVersion: number;
  readonly modelKey: string;
  readonly modelVersion: number;
  readonly method: ForecastMethod;
  readonly horizon: number;
  /** The lever set as it stood when the scenario was published, in application order. */
  readonly levers: readonly LeverView[];
  /** The distinct beliefs this run varied. Empty where its levers were bound to no assumption. */
  readonly variedAssumptionKeys: readonly string[];
  /** Every baseline period, with the scenario value beside it. Never a subset — see {@link simulate}. */
  readonly points: readonly SimulationPoint[];
  readonly totalBaseline: number;
  readonly totalScenario: number;
  readonly totalDelta: number;
  /** The largest single-period movement, signed. The number a reader checks a scenario's plausibility against. */
  readonly peakDelta: number;
  /** The baseline's grade, carried forward unchanged. A scenario is never more certain than what it moves. */
  readonly inheritedUncertainty: UncertaintyGrade;
  /** Whether an `override` lever discarded the projection for at least one period. */
  readonly overridden: boolean;
  /** Levers that touched nothing: inadmissible, or starting past the end of the projection. */
  readonly unappliedLeverKeys: readonly string[];
  readonly status: SimulationStatus;
  readonly supersededByRunId: Uuid | null;
  readonly supersededAt: ISODateString | null;
  readonly ranByUserId: Uuid | null;
  readonly ranAt: ISODateString;
  readonly createdAt: ISODateString;
  /** Moves only on supersession. The outcome itself is never edited. */
  readonly updatedAt: ISODateString;
}

export interface SimulationRunParams {
  /** Published only. A draft's levers can still move, and a run citing them would misstate its own inputs. */
  readonly scenario: Scenario;
  /** The baseline. Must still be the institution's current answer — superseded and invalidated are refused. */
  readonly forecastRun: ForecastRun;
  readonly ranByUserId?: Uuid | null;
}

// --- Running ---------------------------------------------------------------------

/**
 * Run one published scenario against one current forecast, and keep the result.
 *
 * Both guards fire before any arithmetic, so a refused run costs nothing and — more importantly — never leaves a
 * partial record behind. The tenant and organization come from the scenario rather than the baseline, because
 * the scenario is what the institution authored; the two agree in every path an application service can
 * construct, and this package does not adjudicate which would win if they did not, matching
 * {@link runBacktest}'s treatment of a series and a model.
 *
 * The lever set is non-empty by construction: {@link publishScenario} refuses a scenario that moves nothing, so
 * a published one always carries at least one lever. No guard restates that here, because the only error in the
 * vocabulary that fits says a scenario "cannot be published" — true where it is raised, and actively misleading
 * on a scenario that plainly was.
 */
export function produceSimulationRun(params: SimulationRunParams): SimulationRun {
  const scenario = requirePublishedScenario(params.scenario);
  const forecastRun = requireReproducibleRun(params.forecastRun);

  const outcome = simulate(
    scenario.scenarioKey,
    forecastRun.points,
    scenario.levers,
    forecastRun.uncertainty.grade,
  );

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: scenario.tenantId,
    organizationId: scenario.organizationId,
    scenarioId: scenario.id,
    scenarioKey: outcome.scenarioKey,
    scenarioVersion: scenario.version,
    forecastRunId: forecastRun.id,
    forecastRunDigest: forecastRun.digest,
    seriesKey: forecastRun.seriesKey,
    seriesVersion: forecastRun.seriesVersion,
    modelKey: forecastRun.modelKey,
    modelVersion: forecastRun.modelVersion,
    method: forecastRun.method,
    horizon: forecastRun.horizon,
    levers: scenario.levers,
    variedAssumptionKeys: variedAssumptionKeys(scenario),
    points: outcome.points,
    totalBaseline: outcome.totalBaseline,
    totalScenario: outcome.totalScenario,
    totalDelta: outcome.totalDelta,
    peakDelta: outcome.peakDelta,
    inheritedUncertainty: outcome.inheritedUncertainty,
    overridden: outcome.overridden,
    unappliedLeverKeys: outcome.unappliedLeverKeys,
    status: "completed",
    supersededByRunId: null,
    supersededAt: null,
    ranByUserId: params.ranByUserId ?? null,
    ranAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

// --- Lifecycle -------------------------------------------------------------------

/**
 * Record that a newer simulation has replaced this one.
 *
 * Only a `completed` run may be superseded, so a chain of replacements cannot form and leave two records each
 * claiming to be the one that took over. The outcome is untouched: superseding says this is no longer the
 * institution's current what-if, not that it was ever wrong.
 */
export function supersedeSimulationRun(run: SimulationRun, replacementRunId: Uuid): SimulationRun {
  if (run.status !== "completed") {
    throw new InvalidSimulationTransitionError(run.status, "superseded");
  }
  return touch(run, {
    status: "superseded",
    supersededByRunId: replacementRunId,
    supersededAt: nowIso(),
  });
}

// --- Internals -------------------------------------------------------------------

const touch = (run: SimulationRun, patch: Partial<SimulationRun>): SimulationRun => ({
  ...run,
  ...patch,
  updatedAt: nowIso(),
});

// --- Reading ---------------------------------------------------------------------

/**
 * The outcome in the shape the engine produced it.
 *
 * The record flattens the outcome so a repository stores columns rather than a blob, and this puts it back
 * together for the callers that want the engine's own vocabulary — a comparison against a re-simulation, a
 * serializer that already speaks {@link SimulationOutcome}. Nothing is recomputed: every field is read straight
 * off the record, so this can never disagree with what was stored.
 */
export const simulationOutcome = (run: SimulationRun): SimulationOutcome => ({
  scenarioKey: run.scenarioKey,
  points: run.points,
  totalBaseline: run.totalBaseline,
  totalScenario: run.totalScenario,
  totalDelta: run.totalDelta,
  peakDelta: run.peakDelta,
  inheritedUncertainty: run.inheritedUncertainty,
  overridden: run.overridden,
  unappliedLeverKeys: run.unappliedLeverKeys,
});

/** The simulated period at a given horizon, or `null` where the baseline did not reach that far. */
export const simulationPointAtHorizon = (
  run: SimulationRun,
  horizon: number,
): SimulationPoint | null => run.points.find((point) => point.horizon === horizon) ?? null;

/** Whether this run is still the institution's current what-if for its scenario. */
export const isSimulationCurrent = (run: SimulationRun): boolean => run.status === "completed";

/**
 * Whether every configured lever reached at least one period.
 *
 * `false` means the run answered a smaller question than the one configured — a magnitude the engine refused, or
 * a `fromHorizon` beyond the projection's end. The outcome is still valid over what it did move; this is what
 * says a reader should check the configuration before quoting it.
 */
export const fullyApplied = (run: SimulationRun): boolean => run.unappliedLeverKeys.length === 0;

/** The periods where the scenario actually departs from the baseline. */
export const movedPeriods = (run: SimulationRun): readonly number[] =>
  run.points.filter((point) => point.delta !== 0).map((point) => point.period);

/**
 * The whole-projection movement as a fraction of the baseline total.
 *
 * `null` where the baseline totals zero, mirroring a point's `relativeDelta`: a proportional movement against
 * nothing is undefined, and reporting it as zero or infinity would both be claims the arithmetic cannot support.
 * Note that a baseline summing to zero across periods of opposite sign is unusual but not impossible, so this is
 * a real case rather than a formality.
 */
export const relativeTotalDelta = (run: SimulationRun): number | null =>
  run.totalBaseline === 0 ? null : roundValue(run.totalDelta / run.totalBaseline);

/** How anything downstream refers to this run: the run, the scenario, and the lever set it pinned. */
export const simulationReference = (
  run: SimulationRun,
): { simulationRunId: Uuid; scenarioKey: string; scenarioVersion: number } => ({
  simulationRunId: run.id,
  scenarioKey: run.scenarioKey,
  scenarioVersion: run.scenarioVersion,
});
