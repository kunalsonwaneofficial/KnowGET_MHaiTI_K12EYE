import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { type Backtest, runBacktest } from "./backtest";
import {
  BacktestNotFoundError,
  ForecastModelNotFoundError,
  ObservationSeriesNotFoundError,
  PersonNotFoundForForecastError,
} from "./errors";
import { backtestScored } from "./forecast-events";
import type { ForecastModel } from "./forecast-model";
import type { ObservationSeries } from "./observation-series";
import type {
  BacktestRepository,
  ForecastModelRepository,
  ObservationSeriesRepository,
  PersonDirectory,
} from "./ports";

/** What scoring a model asks for: a series to score it against, and how much history to hold back. */
export interface RunBacktestParams {
  readonly seriesId: Uuid;
  readonly modelId: Uuid;
  /** Clamped to what the series can afford. Omitted means the largest honest holdout. */
  readonly holdoutSize?: number;
  readonly ranByUserId?: Uuid | null;
}

/**
 * Application service for backtests — the evidence a model is published on.
 *
 * A backtest has no lifecycle, and that is the point. It is a measurement, not a record under management: it is
 * taken once against a stated split of a stated series, and there is nothing to amend afterwards. Scoring the
 * same pair again produces a second backtest rather than restating the first, so a model whose score improved
 * after a retune carries both readings and an auditor can see the sequence. Nothing here deletes one.
 *
 * The model is loaded whatever its status, deliberately. Backtesting is what earns publication, so refusing a
 * draft would invert the sequence and leave publication with nothing to cite.
 *
 * What this service adds to {@link runBacktest} is existence: the series and the model must be records in this
 * tenant, and a named runner must be a person. The aggregate cannot check any of the three, because all three
 * live outside it.
 */
export interface BacktestServiceDeps {
  readonly repository: BacktestRepository;
  readonly series: ObservationSeriesRepository;
  readonly models: ForecastModelRepository;
  readonly people: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class BacktestService {
  private readonly repository: BacktestRepository;
  private readonly series: ObservationSeriesRepository;
  private readonly models: ForecastModelRepository;
  private readonly people: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: BacktestServiceDeps) {
    this.repository = deps.repository;
    this.series = deps.series;
    this.models = deps.models;
    this.people = deps.people;
    this.events = deps.events;
  }

  // --- Scoring ---------------------------------------------------------------------

  /**
   * Score a model against history it was not fitted on, and keep the reading.
   *
   * Every check runs before anything is written, so a refusal from any of them leaves the store as it was.
   */
  async run(tenantId: TenantId, params: RunBacktestParams): Promise<Backtest> {
    const series = await this.requireSeries(tenantId, params.seriesId);
    const model = await this.requireModel(tenantId, params.modelId);
    if (params.ranByUserId) {
      await this.requirePerson(tenantId, params.ranByUserId);
    }

    const backtest = runBacktest({
      series,
      model,
      holdoutSize: params.holdoutSize,
      ranByUserId: params.ranByUserId ?? null,
    });

    await this.repository.save(backtest);
    await this.emit(backtestScored(backtest));
    return backtest;
  }

  // --- Reading ---------------------------------------------------------------------

  /** One backtest, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<Backtest> {
    const backtest = await this.repository.findById(tenantId, id);
    if (!backtest) {
      throw new BacktestNotFoundError(id);
    }
    return backtest;
  }

  /** The most recent score for a series and a model together — the reading a publication would cite. */
  async findLatestForPair(
    tenantId: TenantId,
    seriesId: Uuid,
    modelId: Uuid,
  ): Promise<Backtest | null> {
    return this.repository.findLatestForPair(tenantId, seriesId, modelId);
  }

  /** Every score a model has taken. Read together, they say whether it holds up or got lucky once. */
  async listByModel(tenantId: TenantId, modelId: Uuid): Promise<readonly Backtest[]> {
    return this.repository.listByModel(tenantId, modelId);
  }

  /** Every score taken against a series. Which methods were tried on this history, and how they did. */
  async listBySeries(tenantId: TenantId, seriesId: Uuid): Promise<readonly Backtest[]> {
    return this.repository.listBySeries(tenantId, seriesId);
  }

  /** Every backtest in the tenant. */
  async list(tenantId: TenantId): Promise<readonly Backtest[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The series being scored against, or a 404 naming it. */
  private async requireSeries(tenantId: TenantId, id: Uuid): Promise<ObservationSeries> {
    const series = await this.series.findById(tenantId, id);
    if (!series) {
      throw new ObservationSeriesNotFoundError(id);
    }
    return series;
  }

  /** The model being scored, at any status, or a 404 naming it. */
  private async requireModel(tenantId: TenantId, id: Uuid): Promise<ForecastModel> {
    const model = await this.models.findById(tenantId, id);
    if (!model) {
      throw new ForecastModelNotFoundError(id);
    }
    return model;
  }

  /** The person who ran it, checked against the directory. */
  private async requirePerson(tenantId: TenantId, personId: Uuid): Promise<void> {
    if (!(await this.people.exists(tenantId, personId))) {
      throw new PersonNotFoundForForecastError(personId, "person who ran the backtest");
    }
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
