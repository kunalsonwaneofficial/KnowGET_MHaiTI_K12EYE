import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { MetricDirection, PeriodGrain, SeriesStatus } from "./forecast-value";
import {
  isFiniteValue,
  normalizeMetricKey,
  normalizeSeriesKey,
  normalizeSourceDomain,
  roundValue,
} from "./forecast-value";
import type { Observation, SeriesView } from "./forecast-view";
import {
  EmptyMetricKeyError,
  EmptySeriesKeyError,
  InvalidCycleLengthError,
  InvalidObservationPeriodError,
  InvalidSeriesTransitionError,
  NonFiniteObservationError,
  ObservationAlreadyRecordedError,
  ObservationNotFoundError,
  SeriesClosedError,
} from "./errors";
import { inspectSeries, sortObservations } from "./series";

/**
 * The measured past: what actually happened, on a declared grid, in a form a forecast can be derived from.
 *
 * Twenty-four operational domains send their history here rather than each keeping a private one, and the reason
 * is the fourth rule. A forecast is reproducible only if the numbers it was computed from can be identified
 * later, and "the attendance figures" is not an identification — the attendance figures move. `version` is the
 * identification: a monotonic counter that advances on every change to what this series says, so a run that
 * pinned version 7 is making a claim about a specific body of data rather than about whatever the series happens
 * to hold when somebody asks.
 *
 * That is why the version bumps on **appends** too, and not only on corrections. A new observation at the end of
 * a series changes what a re-run computes — the fit, the residuals, the spread, every point — and a version that
 * only moved on restatements would let a re-run produce different numbers while {@link reproducibilityKeyOf}
 * still reported the same digest. The digest would be attesting to something that was no longer true, which is
 * worse than having no digest, because people would trust it. The same reasoning is why
 * {@link declareCycleLength} bumps: the cycle is not in the digest's field list, so it reaches a seasonal
 * forecast's arithmetic through the series version or it reaches it invisibly.
 *
 * Recording and correcting are separate acts and each refuses the other's situation. {@link recordObservation}
 * will not overwrite a period that is already there and {@link correctObservation} will not invent one that is
 * not — because an ingestion job replaying its input is the ordinary case, and the version where it silently
 * restates six months of history is indistinguishable from the version where it correctly appends, right up
 * until someone asks why the forecast moved.
 *
 * A closed series is frozen, corrections included. A late correction to a series the institution has declared
 * final is a real event, and it is one that should be visible: reopen, correct, close. Three recorded acts
 * rather than one quiet one, which is the whole difference between a record and a database.
 *
 * There is no clock in the grid. `period` is an integer index the caller defines and `label` is display text
 * this aggregate never parses, so a series behaves identically at `day`, `term` and `year` grain and a review
 * run years later lands on the same periods it did the first time.
 */

// --- The aggregate ---------------------------------------------------------------

export interface ObservationSeries {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** Unique within the organization, so a model naming a series always means one series. */
  readonly seriesKey: string;
  /** What is measured — the metric this is a history of. */
  readonly metricKey: string;
  /** The operational domain the subject lives in. An opaque reference outward; never re-modelled here. */
  readonly sourceDomain: string;
  /** The specific record measured, where there is one. Null for an institution-wide series. */
  readonly subjectRef: string | null;
  readonly grain: PeriodGrain;
  readonly direction: MetricDirection;
  /** Declared, never inferred from the grain. A guessed season produces a specifically wrong forecast. */
  readonly cycleLength: number | null;
  /** Display unit, carried for readers. No engine reads it. */
  readonly unit: string | null;
  /** Always held sorted by period, so inspection never depends on the order things arrived in. */
  readonly observations: readonly Observation[];
  /** Advances on every change to the observations or the cycle. What a forecast run pins. */
  readonly version: number;
  readonly status: SeriesStatus;
  readonly closedAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface ObservationSeriesParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly seriesKey: string;
  readonly metricKey: string;
  readonly sourceDomain: string;
  readonly subjectRef?: string | null;
  readonly grain: PeriodGrain;
  readonly direction: MetricDirection;
  readonly cycleLength?: number | null;
  readonly unit?: string | null;
}

/** An observation as a caller supplies it, before the series has judged it. */
export interface ObservationInput {
  readonly period: number;
  readonly value: number;
  readonly label: string;
}

// --- Declaration -----------------------------------------------------------------

/**
 * Declare a series. It starts empty, at version 1, and accumulates from there.
 *
 * Version 1 rather than 0 because a version is an identity a run pins, not a count of the changes made, and a
 * run against an empty series is refused elsewhere for its own reasons rather than by the counter reading zero.
 */
export function declareObservationSeries(params: ObservationSeriesParams): ObservationSeries {
  const seriesKey = normalizeSeriesKey(params.seriesKey);
  if (seriesKey.length === 0) throw new EmptySeriesKeyError();

  const metricKey = normalizeMetricKey(params.metricKey);
  if (metricKey.length === 0) throw new EmptyMetricKeyError();

  const cycleLength = params.cycleLength ?? null;
  guardCycleLength(cycleLength);

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    seriesKey,
    metricKey,
    sourceDomain: normalizeSourceDomain(params.sourceDomain),
    subjectRef: params.subjectRef ?? null,
    grain: params.grain,
    direction: params.direction,
    cycleLength,
    unit: params.unit ?? null,
    observations: [],
    version: 1,
    status: "active",
    closedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Declare — or withdraw — the series' seasonal cycle.
 *
 * This bumps the version, and the reason is the one place the reproducibility digest is deliberately narrow. The
 * digest's field list does not include the cycle, so a seasonal run's arithmetic reaches it only through
 * `seriesVersion`. Change the cycle without bumping and every historical seasonal run re-runs to different
 * numbers under an unchanged digest — the exact failure the digest exists to make impossible.
 */
export function declareCycleLength(
  series: ObservationSeries,
  cycleLength: number | null,
): ObservationSeries {
  guardOpen(series);
  guardCycleLength(cycleLength);
  if (cycleLength === series.cycleLength) return series;
  return bump(series, { cycleLength });
}

// --- Observations ----------------------------------------------------------------

/**
 * Append one observation.
 *
 * Refuses a period already present rather than overwriting it. Restating a figure is a correction, and a
 * correction is a decision somebody makes rather than a side effect an ingestion job has.
 */
export const recordObservation = (
  series: ObservationSeries,
  observation: ObservationInput,
): ObservationSeries => recordObservations(series, [observation]);

/**
 * Append several observations as a single act.
 *
 * Validated whole and applied whole: a batch with one bad period leaves the series untouched, and a good batch
 * advances the version once rather than once per row. A bulk import of three years of history is one thing that
 * happened to the series, and thirty-six version numbers would be thirty-six identities nobody will ever pin.
 *
 * Duplicates are refused within the batch as well as against the series, because a batch quietly deduplicating
 * itself is the same silent restatement {@link recordObservation} refuses, arriving by a different door.
 */
export function recordObservations(
  series: ObservationSeries,
  observations: readonly ObservationInput[],
): ObservationSeries {
  guardOpen(series);
  if (observations.length === 0) return series;

  const periods = new Set(series.observations.map((observation) => observation.period));
  const accepted: Observation[] = [];

  for (const observation of observations) {
    guardObservation(observation);
    if (periods.has(observation.period)) {
      throw new ObservationAlreadyRecordedError(series.seriesKey, observation.period);
    }
    periods.add(observation.period);
    accepted.push(normalize(observation));
  }

  return bump(series, { observations: [...series.observations, ...accepted] });
}

/**
 * Restate an observation that is already there.
 *
 * The label may be restated with the value or left as it was; a corrected figure for `2026-03` is still
 * `2026-03`, and forcing every caller to resupply the label invites the one that gets it wrong.
 */
export function correctObservation(
  series: ObservationSeries,
  period: number,
  value: number,
  label?: string,
): ObservationSeries {
  guardOpen(series);
  const existing = observationAt(series, period);
  if (existing === null) throw new ObservationNotFoundError(series.seriesKey, period);

  guardObservation({ period, value, label: label ?? existing.label });
  const corrected = normalize({ period, value, label: label ?? existing.label });
  if (corrected.value === existing.value && corrected.label === existing.label) return series;

  return bump(series, {
    observations: series.observations.map((observation) =>
      observation.period === period ? corrected : observation,
    ),
  });
}

/**
 * Withdraw an observation entirely.
 *
 * Withdrawal is not correction to zero: a period nobody measured and a period measured at zero are different
 * claims, and a series that cannot express the first will report a gap as a collapse.
 */
export function withdrawObservation(series: ObservationSeries, period: number): ObservationSeries {
  guardOpen(series);
  if (observationAt(series, period) === null) {
    throw new ObservationNotFoundError(series.seriesKey, period);
  }
  return bump(series, {
    observations: series.observations.filter((observation) => observation.period !== period),
  });
}

// --- Lifecycle -------------------------------------------------------------------

/**
 * Close the series. It takes no further observations and no further corrections.
 *
 * Closing does not bump the version. Nothing the series *says* has changed — the same numbers are there, in the
 * same order — and bumping would report drift on every run that pinned it, for an event that moved no arithmetic
 * whatsoever. A version that advances on things the digest does not depend on is a version that trains people to
 * ignore `series_version_changed`.
 */
export function closeSeries(series: ObservationSeries): ObservationSeries {
  if (series.status !== "active") throw new InvalidSeriesTransitionError(series.status, "closed");
  return touch(series, { status: "closed", closedAt: nowIso() });
}

/** Reopen a closed series so a late correction can be made, and made visibly. */
export function reopenSeries(series: ObservationSeries): ObservationSeries {
  if (series.status !== "closed") throw new InvalidSeriesTransitionError(series.status, "active");
  return touch(series, { status: "active", closedAt: null });
}

// --- Guards ----------------------------------------------------------------------

function guardCycleLength(cycleLength: number | null): void {
  if (cycleLength === null) return;
  if (!Number.isInteger(cycleLength) || cycleLength < 2) {
    throw new InvalidCycleLengthError(cycleLength);
  }
}

function guardObservation(observation: ObservationInput): void {
  if (!Number.isInteger(observation.period)) {
    throw new InvalidObservationPeriodError(observation.period);
  }
  if (!isFiniteValue(observation.value)) {
    throw new NonFiniteObservationError(observation.period);
  }
}

function guardOpen(series: ObservationSeries): void {
  if (series.status === "closed") throw new SeriesClosedError(series.id);
}

// --- Internals -------------------------------------------------------------------

const normalize = (observation: ObservationInput): Observation => ({
  period: observation.period,
  value: roundValue(observation.value),
  label: observation.label.trim(),
});

const touch = (
  series: ObservationSeries,
  patch: Partial<ObservationSeries>,
): ObservationSeries => ({
  ...series,
  ...patch,
  updatedAt: nowIso(),
});

/**
 * Apply a change that alters what the series says, advancing the version and restoring the sort.
 *
 * Sorting on every change rather than trusting arrival order is what makes the version meaningful: two series
 * holding the same observations must render the same {@link SeriesView}, or the same version would describe two
 * different inputs depending on the order somebody imported them in.
 */
const bump = (series: ObservationSeries, patch: Partial<ObservationSeries>): ObservationSeries => {
  const next = touch(series, { ...patch, version: series.version + 1 });
  return { ...next, observations: sortObservations(next.observations) };
};

// --- Reading ---------------------------------------------------------------------

/** The engines' view of this series. Every engine reads a series through this and nothing else. */
export const toSeriesView = (series: ObservationSeries): SeriesView => ({
  seriesKey: series.seriesKey,
  grain: series.grain,
  direction: series.direction,
  cycleLength: series.cycleLength,
  observations: series.observations,
});

/** The observation at a period, or `null` where the series never recorded one. */
export const observationAt = (series: ObservationSeries, period: number): Observation | null =>
  series.observations.find((observation) => observation.period === period) ?? null;

/** The latest observation by period, or `null` for an empty series. */
export const latestObservation = (series: ObservationSeries): Observation | null =>
  series.observations[series.observations.length - 1] ?? null;

/** The earliest observation by period, or `null` for an empty series. */
export const earliestObservation = (series: ObservationSeries): Observation | null =>
  series.observations[0] ?? null;

/** How many observations the series holds. */
export const observationCount = (series: ObservationSeries): number => series.observations.length;

/** Whether the series still accepts observations. */
export const isSeriesOpen = (series: ObservationSeries): boolean => series.status === "active";

/**
 * Whether any forecast can be derived from this series at all.
 *
 * Delegated to {@link inspectSeries} rather than reimplemented, so the answer a caller gets before requesting a
 * run is the same answer the run itself will reach.
 */
export const isSeriesForecastable = (series: ObservationSeries): boolean =>
  inspectSeries(toSeriesView(series)).forecastable;
