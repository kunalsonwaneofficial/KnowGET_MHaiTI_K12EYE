import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateSeriesKeyError,
  ObservationSeriesNotFoundError,
  OrganizationNotFoundForForecastError,
  SeriesSubjectNotFoundError,
} from "./errors";
import {
  seriesClosed,
  seriesCycleDeclared,
  seriesDeclared,
  seriesObservationCorrected,
  seriesObservationWithdrawn,
  seriesObserved,
  seriesReopened,
} from "./forecast-events";
import {
  type ObservationInput,
  type ObservationSeries,
  type ObservationSeriesParams,
  closeSeries,
  correctObservation,
  declareCycleLength,
  declareObservationSeries,
  recordObservations,
  reopenSeries,
  withdrawObservation,
} from "./observation-series";
import type {
  ObservationSeriesRepository,
  OrganizationDirectory,
  SeriesSubjectDirectory,
} from "./ports";

/**
 * Application service for observation series — the measured history everything else in this package reads.
 *
 * Three things live here that the aggregate cannot hold on its own, and all three are about the world outside it.
 *
 * A series key is unique within an organization, which is a fact about a series' siblings rather than about the
 * series, so the clash is caught here against the store. The check runs on the normalized key the aggregate
 * produced rather than on the string the caller sent, because `Attendance.Rate ` and `attendance.rate` are the
 * same key and a uniqueness rule that could not see that would be decorative.
 *
 * The subject is checked against the domain that owns it. A series names its subject as an opaque reference
 * outward — `attendance` / some student id — and this package never re-models what is on the other end. But a
 * reference that resolves to nobody produces a forecast about nothing, and does so quietly for as long as
 * nobody thinks to look. The reference is checked at the one moment it is asserted.
 *
 * Everything after declaration is a guarded pure move on the aggregate, announced. The series is where the
 * institution's measured past lives, so nothing here can delete a reading: a correction restates it and keeps
 * the version moving, a withdrawal removes the claim that it was ever measured, and closing the series stops
 * new readings without touching the ones already taken.
 */
export interface ObservationSeriesServiceDeps {
  readonly repository: ObservationSeriesRepository;
  readonly organizations: OrganizationDirectory;
  readonly subjects: SeriesSubjectDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class ObservationSeriesService {
  private readonly repository: ObservationSeriesRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly subjects: SeriesSubjectDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: ObservationSeriesServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.subjects = deps.subjects;
    this.events = deps.events;
  }

  // --- Declaration -----------------------------------------------------------------

  /**
   * Declare a series. It starts empty and accumulates from there.
   *
   * The organization, the subject and the key are all checked before anything is written, so a refusal from any
   * of them leaves the store exactly as it was.
   */
  async declare(input: ObservationSeriesParams): Promise<ObservationSeries> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForForecastError(input.organizationId);
    }

    const series = declareObservationSeries(input);
    if (series.subjectRef !== null) {
      if (!(await this.subjects.exists(series.tenantId, series.sourceDomain, series.subjectRef))) {
        throw new SeriesSubjectNotFoundError(series.sourceDomain, series.subjectRef);
      }
    }

    const clash = await this.repository.findByKey(
      series.tenantId,
      series.organizationId,
      series.seriesKey,
    );
    if (clash) {
      throw new DuplicateSeriesKeyError(series.seriesKey);
    }

    await this.repository.save(series);
    await this.emit(seriesDeclared(series));
    return series;
  }

  /** Declare or withdraw the season. Every seasonal forecast over this series reads differently after it. */
  async declareCycle(
    tenantId: TenantId,
    id: Uuid,
    cycleLength: number | null,
  ): Promise<ObservationSeries> {
    return this.transition(tenantId, id, declareCycleLength, seriesCycleDeclared, cycleLength);
  }

  // --- Observations ----------------------------------------------------------------

  /** Append readings. Refused on a period already present — restating one is a correction, not an append. */
  async record(
    tenantId: TenantId,
    id: Uuid,
    observations: readonly ObservationInput[],
  ): Promise<ObservationSeries> {
    return this.transition(tenantId, id, recordObservations, seriesObserved, observations);
  }

  /**
   * Restate a reading that was already taken.
   *
   * Announced separately from an append because it invalidates conclusions an append does not: every forecast
   * pinned to the version before this one was computed from a figure the institution no longer stands behind.
   */
  async correct(
    tenantId: TenantId,
    id: Uuid,
    period: number,
    value: number,
    label?: string,
  ): Promise<ObservationSeries> {
    return this.transition(
      tenantId,
      id,
      correctObservation,
      seriesObservationCorrected,
      period,
      value,
      label,
    );
  }

  /** Take a reading back entirely. A period nobody measured is not a period measured at zero. */
  async withdraw(tenantId: TenantId, id: Uuid, period: number): Promise<ObservationSeries> {
    return this.transition(tenantId, id, withdrawObservation, seriesObservationWithdrawn, period);
  }

  // --- Lifecycle -------------------------------------------------------------------

  /** Stop admitting readings. Everything already measured stays exactly as it is. */
  async close(tenantId: TenantId, id: Uuid): Promise<ObservationSeries> {
    return this.transition(tenantId, id, closeSeries, seriesClosed);
  }

  /** Admit readings again. */
  async reopen(tenantId: TenantId, id: Uuid): Promise<ObservationSeries> {
    return this.transition(tenantId, id, reopenSeries, seriesReopened);
  }

  // --- Reading ---------------------------------------------------------------------

  /** One series, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<ObservationSeries> {
    return this.require(tenantId, id);
  }

  /** The series an organization keeps under this key, if it keeps one. */
  async findByKey(
    tenantId: TenantId,
    organizationId: Uuid,
    seriesKey: string,
  ): Promise<ObservationSeries | null> {
    return this.repository.findByKey(tenantId, organizationId, seriesKey);
  }

  /**
   * Every series measuring one metric, however many subjects it is measured across. What a plan reviewing
   * itself against that metric reads, and what a change in the metric's definition puts in question.
   */
  async listByMetric(tenantId: TenantId, metricKey: string): Promise<readonly ObservationSeries[]> {
    return this.repository.listByMetric(tenantId, metricKey);
  }

  /** Every series measured about one record in one operational domain. */
  async listBySubject(
    tenantId: TenantId,
    sourceDomain: string,
    subjectRef: string,
  ): Promise<readonly ObservationSeries[]> {
    return this.repository.listBySubject(tenantId, sourceDomain, subjectRef);
  }

  /** Every series in the tenant. */
  async list(tenantId: TenantId): Promise<readonly ObservationSeries[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The series under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<ObservationSeries> {
    const series = await this.repository.findById(tenantId, id);
    if (!series) {
      throw new ObservationSeriesNotFoundError(id);
    }
    return series;
  }

  /** Load, apply a guarded pure transition, save, announce. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (series: ObservationSeries, ...args: TArgs) => ObservationSeries,
    announce: (series: ObservationSeries) => DomainEvent,
    ...args: TArgs
  ): Promise<ObservationSeries> {
    const next = move(await this.require(tenantId, id), ...args);
    await this.repository.save(next);
    await this.emit(announce(next));
    return next;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
