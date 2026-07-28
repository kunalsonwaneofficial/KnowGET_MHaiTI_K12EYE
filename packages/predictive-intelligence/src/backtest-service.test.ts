import { beforeEach, describe, expect, it } from "vitest";

import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import type { RunBacktestParams } from "./backtest-service";
import { BacktestService } from "./backtest-service";
import {
  BacktestNotFoundError,
  ForecastModelNotFoundError,
  ObservationSeriesNotFoundError,
  PersonNotFoundForForecastError,
} from "./errors";
import type { ForecastModel, ForecastModelParams } from "./forecast-model";
import { draftForecastModel, publishModel } from "./forecast-model";
import type { ObservationSeries } from "./observation-series";
import { declareObservationSeries, recordObservations } from "./observation-series";
import {
  InMemoryBacktestRepository,
  InMemoryForecastModelRepository,
  InMemoryObservationSeriesRepository,
} from "./ports";

const T1 = "11111111-1111-4111-8111-111111111111" as TenantId;
const T2 = "22222222-2222-4222-8222-222222222222" as TenantId;
const ORG = "33333333-3333-4333-8333-333333333333" as Uuid;
const ANALYST = "44444444-4444-4444-8444-444444444444" as Uuid;
const STRANGER = "66666666-6666-4666-8666-666666666666" as Uuid;
const MISSING = "99999999-9999-4999-8999-999999999999" as Uuid;

/** A clean upward ramp, which a linear trend reproduces exactly and a naive carry-forward does not. */
const seriesIn = (tenantId: TenantId): ObservationSeries =>
  recordObservations(
    declareObservationSeries({
      tenantId,
      organizationId: ORG,
      seriesKey: "attendance.rate.grade7",
      metricKey: "attendance.rate",
      sourceDomain: "attendance",
      grain: "month",
      direction: "higher_is_better",
    }),
    Array.from({ length: 12 }, (_, index) => ({
      period: index,
      value: 90 + index,
      label: `2026-${String(index + 1).padStart(2, "0")}`,
    })),
  );

const draftIn = (tenantId: TenantId, overrides: Partial<ForecastModelParams> = {}): ForecastModel =>
  draftForecastModel({
    tenantId,
    organizationId: ORG,
    modelKey: "attendance.trend",
    name: "Attendance trend",
    method: "linear_trend",
    ...overrides,
  });

describe("BacktestService", () => {
  let repository: InMemoryBacktestRepository;
  let seriesRepository: InMemoryObservationSeriesRepository;
  let models: InMemoryForecastModelRepository;
  let people: Set<string>;
  let published: DomainEvent[];
  let svc: BacktestService;
  let series: ObservationSeries;
  let model: ForecastModel;

  beforeEach(async () => {
    repository = new InMemoryBacktestRepository();
    seriesRepository = new InMemoryObservationSeriesRepository();
    models = new InMemoryForecastModelRepository();
    people = new Set<string>([ANALYST]);
    published = [];
    svc = new BacktestService({
      repository,
      series: seriesRepository,
      models,
      people: {
        async exists(_tenantId: TenantId, personId: Uuid): Promise<boolean> {
          return people.has(personId);
        },
      },
      events: {
        async publish(event: DomainEvent): Promise<void> {
          published.push(event);
        },
      },
    });

    series = seriesIn(T1);
    model = publishModel(draftIn(T1), 1);
    await seriesRepository.save(series);
    await models.save(model);
  });

  const types = (): readonly string[] => published.map((event) => event.type);

  const params = (patch: Partial<RunBacktestParams> = {}): RunBacktestParams => ({
    seriesId: series.id,
    modelId: model.id,
    holdoutSize: 3,
    ...patch,
  });

  // --- Scoring ---------------------------------------------------------------------

  describe("run", () => {
    it("scores a model against history it was not fitted on and announces the reading", async () => {
      const backtest = await svc.run(T1, params({ ranByUserId: ANALYST }));

      expect(backtest.holdoutSize).toBe(3);
      expect(backtest.scored).toHaveLength(3);
      expect(backtest.publishable).toBe(true);
      expect(await repository.findById(T1, backtest.id)).toEqual(backtest);
      expect(types()).toEqual(["forecast.backtest.scored"]);
    });

    it("scores a draft, because scoring is what earns publication", async () => {
      const draft = draftIn(T1, { modelKey: "attendance.candidate", name: "A candidate method" });
      await models.save(draft);

      const backtest = await svc.run(T1, params({ modelId: draft.id }));

      // Refusing a draft would invert the sequence and leave publication with nothing to cite.
      expect(backtest.modelVersion).toBe(0);
      expect(backtest.publishable).toBe(true);
    });

    it("reports a method that did not beat carrying the last figure forward", async () => {
      const naive = draftIn(T1, { modelKey: "attendance.naive", method: "naive" });
      await models.save(naive);

      const backtest = await svc.run(T1, params({ modelId: naive.id }));

      expect(backtest.scores.skillScore).toBe(0);
      expect(backtest.publishable).toBe(false);
      expect(types()).toEqual(["forecast.backtest.scored"]);
    });

    it("takes the largest honest holdout when none is asked for", async () => {
      const backtest = await svc.run(T1, params({ holdoutSize: undefined }));

      expect(backtest.holdoutSize).toBeGreaterThan(0);
      expect(backtest.trainingCount + backtest.holdoutSize).toBe(12);
    });

    it("refuses a series that is not there, writing nothing", async () => {
      await expect(svc.run(T1, params({ seriesId: MISSING }))).rejects.toThrow(
        ObservationSeriesNotFoundError,
      );

      expect(await repository.listByTenant(T1)).toEqual([]);
      expect(published).toEqual([]);
    });

    it("refuses a model that is not there, writing nothing", async () => {
      await expect(svc.run(T1, params({ modelId: MISSING }))).rejects.toThrow(
        ForecastModelNotFoundError,
      );

      expect(await repository.listByTenant(T1)).toEqual([]);
    });

    it("refuses a runner who is not a person, writing nothing", async () => {
      await expect(svc.run(T1, params({ ranByUserId: STRANGER }))).rejects.toThrow(
        PersonNotFoundForForecastError,
      );

      expect(await repository.listByTenant(T1)).toEqual([]);
    });

    it("keeps a second reading beside the first rather than restating it", async () => {
      const first = await svc.run(T1, params());
      const second = await svc.run(T1, params({ holdoutSize: 4 }));

      // A backtest is a measurement, so a retune carries both readings and the sequence is visible.
      expect(second.id).not.toBe(first.id);
      expect(await svc.listByModel(T1, model.id)).toHaveLength(2);
      expect(types()).toEqual(["forecast.backtest.scored", "forecast.backtest.scored"]);
    });
  });

  // --- Reading ---------------------------------------------------------------------

  describe("reads", () => {
    it("finds a reading by id, by pair, by model, by series and across the tenant", async () => {
      const backtest = await svc.run(T1, params());

      expect(await svc.get(T1, backtest.id)).toEqual(backtest);
      expect(await svc.findLatestForPair(T1, series.id, model.id)).toEqual(backtest);
      expect(await svc.listByModel(T1, model.id)).toEqual([backtest]);
      expect(await svc.listBySeries(T1, series.id)).toEqual([backtest]);
      expect(await svc.list(T1)).toEqual([backtest]);
    });

    it("keeps a reading out of another tenant's reach", async () => {
      const backtest = await svc.run(T1, params());

      await expect(svc.get(T2, backtest.id)).rejects.toThrow(BacktestNotFoundError);
      expect(await svc.list(T2)).toEqual([]);
      expect(await svc.findLatestForPair(T2, series.id, model.id)).toBeNull();
    });

    it("404s on a reading that is not there", async () => {
      await expect(svc.get(T1, MISSING)).rejects.toThrow(BacktestNotFoundError);
    });
  });

  // --- Without a bus ---------------------------------------------------------------

  it("works without an event bus", async () => {
    const quiet = new BacktestService({
      repository,
      series: seriesRepository,
      models,
      people: {
        async exists(): Promise<boolean> {
          return true;
        },
      },
    });

    const backtest = await quiet.run(T1, params());

    expect(await repository.findById(T1, backtest.id)).toEqual(backtest);
    expect(published).toEqual([]);
  });
});
