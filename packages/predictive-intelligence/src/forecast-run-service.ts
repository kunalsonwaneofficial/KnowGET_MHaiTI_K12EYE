import type { EventBus } from "@knowget/events";
import { isUuid, toUuid } from "@knowget/shared";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  ForecastModelNotFoundError,
  ForecastRunNotFoundError,
  ModelNotPublishedError,
  ObservationSeriesNotFoundError,
  PersonNotFoundForForecastError,
} from "./errors";
import {
  forecastRunInvalidated,
  forecastRunProduced,
  forecastRunSuperseded,
} from "./forecast-events";
import type { ForecastModel } from "./forecast-model";
import {
  type ForecastRun,
  invalidateRun,
  produceForecastRun,
  runInputs,
  supersedeRun,
  verifyRun,
} from "./forecast-run";
import type { AssumptionView, ReproductionResult } from "./forecast-view";
import type { ObservationSeries } from "./observation-series";
import type {
  ForecastModelRepository,
  ForecastRunRepository,
  ObservationSeriesRepository,
  PersonDirectory,
} from "./ports";

/** What producing a forecast asks for: a series, a method, how far ahead, and on what grounds. */
export interface ProduceForecastRunParams {
  readonly seriesId: Uuid;
  readonly modelId: Uuid;
  readonly horizon: number;
  readonly assumptions: readonly AssumptionView[];
  readonly producedByUserId?: Uuid | null;
}

/**
 * Application service for forecast runs — the contract's fourth rule, at the moment it is exercised.
 *
 * Producing a forecast is where three records meet: the series that supplies the history, the model that
 * supplies the method, and the people named on the grounds. The aggregate refuses an unpublished model, an
 * unforecastable series and an over-long horizon on its own. What it cannot do is check that an assumption
 * attributed to a named holder is attributed to a person who exists, and that gap matters more here than
 * anywhere else in the package: `expert_judgement` means a named person's judgement or it means nothing, and an
 * id that resolves to nobody is an unattributed belief with a plausible-looking field filled in.
 *
 * **Production is idempotent on the digest.** A digest covers the pinned inputs and nothing else, so a request
 * that digests to a run already standing is the same computation asked for twice; the standing run is returned
 * unchanged rather than a second identical record being written. That keeps `findByDigest` unambiguous by
 * construction and keeps the history free of duplicate rows that differ only in who asked. A superseded or
 * invalidated run does not short-circuit — its digest matches, but the institution has already retired it, and
 * asking again is asking for a live answer.
 *
 * **Re-verification produces a shadow rather than trusting a verdict.** The shadow is built from the series as
 * it stands *now* and from whatever version is published under the run's model key *now*, and the comparison is
 * what says whether the run still reproduces. Resolving the model by key rather than by the pinned row is
 * deliberate: a published row is frozen, so comparing a run against its own frozen row could only ever say
 * "yes", and the retune it should have caught would go unnoticed. A series that has since been corrected past
 * the point of being forecastable, or a horizon its shortened history can no longer support, raises rather than
 * returning a verdict — those are distinguishable conditions and flattening them into "not reproducible" would
 * throw away the only information a reconciler has.
 */
export interface ForecastRunServiceDeps {
  readonly repository: ForecastRunRepository;
  readonly series: ObservationSeriesRepository;
  readonly models: ForecastModelRepository;
  readonly people: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class ForecastRunService {
  private readonly repository: ForecastRunRepository;
  private readonly series: ObservationSeriesRepository;
  private readonly models: ForecastModelRepository;
  private readonly people: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: ForecastRunServiceDeps) {
    this.repository = deps.repository;
    this.series = deps.series;
    this.models = deps.models;
    this.people = deps.people;
    this.events = deps.events;
  }

  // --- Producing -------------------------------------------------------------------

  /**
   * Produce a forecast, or hand back the one that already answers this exact question.
   *
   * Every check runs before anything is written, so a refusal from any of them leaves the store as it was.
   */
  async produce(tenantId: TenantId, params: ProduceForecastRunParams): Promise<ForecastRun> {
    const series = await this.requireSeries(tenantId, params.seriesId);
    const model = await this.requireModel(tenantId, params.modelId);
    await this.requirePeople(tenantId, params.assumptions, params.producedByUserId);

    const run = produceForecastRun({
      series,
      model,
      horizon: params.horizon,
      assumptions: params.assumptions,
      producedByUserId: params.producedByUserId ?? null,
    });

    const standing = await this.repository.findByDigest(tenantId, run.digest);
    if (standing && standing.status === "completed") {
      return standing;
    }

    await this.repository.save(run);
    await this.emit(forecastRunProduced(run));
    return run;
  }

  /** A newer forecast replaced this one. Whoever is still citing it should stop. */
  async supersede(tenantId: TenantId, id: Uuid, replacementRunId: Uuid): Promise<ForecastRun> {
    await this.require(tenantId, replacementRunId);
    return this.transition(tenantId, id, supersedeRun, forecastRunSuperseded, replacementRunId);
  }

  // --- Re-verification -------------------------------------------------------------

  /**
   * Recompute a run from the world as it stands and say whether it still reproduces.
   *
   * Read-only, on purpose. An operator can check a run — routinely, in bulk, on a schedule — with no risk that
   * checking changes it, and {@link ForecastRunService.invalidate} is what acts on the answer.
   */
  async verify(tenantId: TenantId, id: Uuid): Promise<ReproductionResult> {
    const run = await this.require(tenantId, id);
    const shadow = await this.reproduce(tenantId, run);
    return verifyRun(run, runInputs(shadow), shadow.points);
  }

  /**
   * Record that a run no longer reproduces, on the evidence of a fresh recomputation.
   *
   * The evidence is derived here rather than accepted from the caller, so `invalidated` cannot be set by hand.
   * A run that still reproduces is refused by the aggregate, which is what keeps the status meaning the one
   * thing it is supposed to mean.
   */
  async invalidate(tenantId: TenantId, id: Uuid): Promise<ForecastRun> {
    const run = await this.require(tenantId, id);
    const shadow = await this.reproduce(tenantId, run);
    const next = invalidateRun(run, runInputs(shadow), shadow.points);

    await this.repository.save(next);
    await this.emit(forecastRunInvalidated(next));
    return next;
  }

  // --- Reading ---------------------------------------------------------------------

  /** One run, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<ForecastRun> {
    return this.require(tenantId, id);
  }

  /** The run whose pinned inputs digest to this — how "has this exact forecast been produced" is answered. */
  async findByDigest(tenantId: TenantId, digest: string): Promise<ForecastRun | null> {
    return this.repository.findByDigest(tenantId, digest);
  }

  /** The institution's current forecast over a series, if it has one. */
  async findCurrentForSeries(tenantId: TenantId, seriesId: Uuid): Promise<ForecastRun | null> {
    return this.repository.findLatestForSeries(tenantId, seriesId);
  }

  /** Every run over a series. What a correction to that series puts in question. */
  async listBySeries(tenantId: TenantId, seriesId: Uuid): Promise<readonly ForecastRun[]> {
    return this.repository.listBySeries(tenantId, seriesId);
  }

  /** Every run pinned to a model version. What retiring that version puts in question. */
  async listByModel(tenantId: TenantId, modelId: Uuid): Promise<readonly ForecastRun[]> {
    return this.repository.listByModel(tenantId, modelId);
  }

  /** Every run in the tenant. */
  async list(tenantId: TenantId): Promise<readonly ForecastRun[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The run under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<ForecastRun> {
    const run = await this.repository.findById(tenantId, id);
    if (!run) {
      throw new ForecastRunNotFoundError(id);
    }
    return run;
  }

  /** The series being forecast, or a 404 naming it. */
  private async requireSeries(tenantId: TenantId, id: Uuid): Promise<ObservationSeries> {
    const series = await this.series.findById(tenantId, id);
    if (!series) {
      throw new ObservationSeriesNotFoundError(id);
    }
    return series;
  }

  /** The model being pinned, or a 404 naming it. Publication is the aggregate's check, not this one's. */
  private async requireModel(tenantId: TenantId, id: Uuid): Promise<ForecastModel> {
    const model = await this.models.findById(tenantId, id);
    if (!model) {
      throw new ForecastModelNotFoundError(id);
    }
    return model;
  }

  /**
   * Everyone the run names must exist in this tenant: the person who produced it, and every assumption's
   * holder. A holder is only meaningful for `expert_judgement`, but any assumption may carry one, and one
   * carried on any basis is a claim about a person that should be true.
   */
  private async requirePeople(
    tenantId: TenantId,
    assumptions: readonly AssumptionView[],
    producedByUserId: Uuid | null | undefined,
  ): Promise<void> {
    if (producedByUserId) {
      await this.requirePerson(tenantId, producedByUserId, "author of the forecast");
    }
    for (const assumption of assumptions) {
      if (assumption.holderId) {
        await this.requireHolder(
          tenantId,
          assumption.holderId,
          `holder of "${assumption.assumptionKey}"`,
        );
      }
    }
  }

  /** One person, checked against the directory. */
  private async requirePerson(tenantId: TenantId, personId: Uuid, role: string): Promise<void> {
    if (!(await this.people.exists(tenantId, personId))) {
      throw new PersonNotFoundForForecastError(personId, role);
    }
  }

  /**
   * An assumption's holder, which the assumption view holds as an opaque string rather than a branded id.
   *
   * The shape is checked before the directory is asked. A value that is not uuid-shaped cannot be a person, and
   * saying so here is what keeps a malformed reference a 404 about somebody who does not exist rather than a
   * cast error surfacing from whatever store backs the directory.
   */
  private async requireHolder(tenantId: TenantId, holderId: string, role: string): Promise<void> {
    if (!isUuid(holderId)) {
      throw new PersonNotFoundForForecastError(holderId, role);
    }
    await this.requirePerson(tenantId, toUuid(holderId), role);
  }

  /**
   * Re-run a recorded forecast against the world as it stands now.
   *
   * The series is resolved by id — it is one row whose version moves under corrections. The model is resolved
   * by *key*, to the version currently published, because a published row is frozen: comparing a run against
   * the row it pinned could only ever agree with itself. Where a key has rows but none of them is published,
   * the highest version names the refusal, which is a more useful thing to read than a missing record.
   */
  private async reproduce(tenantId: TenantId, run: ForecastRun): Promise<ForecastRun> {
    const series = await this.requireSeries(tenantId, run.seriesId);
    const model = await this.requireCurrentModel(tenantId, run);

    return produceForecastRun({
      series,
      model,
      horizon: run.horizon,
      assumptions: run.assumptions,
    });
  }

  /** Whatever is published under the run's model key today, or the reason there is nothing. */
  private async requireCurrentModel(tenantId: TenantId, run: ForecastRun): Promise<ForecastModel> {
    const published = await this.models.findPublishedByKey(tenantId, run.modelKey);
    if (published) {
      return published;
    }

    const lineage = await this.models.listVersionsOfKey(tenantId, run.modelKey);
    const newest = lineage.reduce<ForecastModel | null>(
      (highest, model) => (highest === null || model.version >= highest.version ? model : highest),
      null,
    );
    if (!newest) {
      throw new ForecastModelNotFoundError(run.modelId);
    }
    throw new ModelNotPublishedError(newest.id, newest.status);
  }

  /** Load, apply a guarded pure transition, save, announce. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (run: ForecastRun, ...args: TArgs) => ForecastRun,
    announce: (run: ForecastRun) => DomainEvent,
    ...args: TArgs
  ): Promise<ForecastRun> {
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
