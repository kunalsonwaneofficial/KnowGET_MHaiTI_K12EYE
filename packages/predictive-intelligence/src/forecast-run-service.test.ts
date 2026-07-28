import { beforeEach, describe, expect, it } from "vitest";

import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  ForecastModelNotFoundError,
  ForecastRunNotFoundError,
  ModelNotPublishedError,
  ObservationSeriesNotFoundError,
  PersonNotFoundForForecastError,
  RunStillReproducesError,
} from "./errors";
import type { ForecastModel, ForecastModelParams } from "./forecast-model";
import { draftForecastModel, publishModel, retireModel } from "./forecast-model";
import type { ForecastRun } from "./forecast-run";
import type { ProduceForecastRunParams } from "./forecast-run-service";
import { ForecastRunService } from "./forecast-run-service";
import type { AssumptionView } from "./forecast-view";
import type { ObservationSeries } from "./observation-series";
import { declareObservationSeries, recordObservations } from "./observation-series";
import {
  InMemoryForecastModelRepository,
  InMemoryForecastRunRepository,
  InMemoryObservationSeriesRepository,
} from "./ports";

const T1 = "11111111-1111-4111-8111-111111111111" as TenantId;
const T2 = "22222222-2222-4222-8222-222222222222" as TenantId;
const ORG = "33333333-3333-4333-8333-333333333333" as Uuid;
const ANALYST = "44444444-4444-4444-8444-444444444444" as Uuid;
const STRANGER = "66666666-6666-4666-8666-666666666666" as Uuid;
const MISSING = "99999999-9999-4999-8999-999999999999" as Uuid;

/** One declared belief. A run standing on no grounds at all is refused by the aggregate. */
const CONTINUITY: AssumptionView = {
  assumptionKey: "intake_flat",
  kind: "continuity",
  basis: "observed_history",
  holderId: null,
  reference: null,
  expectedValue: null,
};

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

const modelIn = (
  tenantId: TenantId,
  overrides: Partial<ForecastModelParams> = {},
  version = 1,
): ForecastModel =>
  publishModel(
    draftForecastModel({
      tenantId,
      organizationId: ORG,
      modelKey: "attendance.trend",
      name: "Attendance trend",
      method: "linear_trend",
      ...overrides,
    }),
    version,
  );

describe("ForecastRunService", () => {
  let repository: InMemoryForecastRunRepository;
  let seriesRepository: InMemoryObservationSeriesRepository;
  let models: InMemoryForecastModelRepository;
  let people: Set<string>;
  let asked: string[];
  let published: DomainEvent[];
  let svc: ForecastRunService;
  let series: ObservationSeries;
  let model: ForecastModel;

  beforeEach(async () => {
    repository = new InMemoryForecastRunRepository();
    seriesRepository = new InMemoryObservationSeriesRepository();
    models = new InMemoryForecastModelRepository();
    people = new Set<string>([ANALYST]);
    asked = [];
    published = [];
    svc = new ForecastRunService({
      repository,
      series: seriesRepository,
      models,
      people: {
        async exists(_tenantId: TenantId, personId: Uuid): Promise<boolean> {
          asked.push(personId);
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
    model = modelIn(T1);
    await seriesRepository.save(series);
    await models.save(model);
  });

  const types = (): readonly string[] => published.map((event) => event.type);

  const params = (patch: Partial<ProduceForecastRunParams> = {}): ProduceForecastRunParams => ({
    seriesId: series.id,
    modelId: model.id,
    horizon: 3,
    assumptions: [CONTINUITY],
    ...patch,
  });

  /** A produced run with the announcement already drained. */
  const produced = async (patch: Partial<ProduceForecastRunParams> = {}): Promise<ForecastRun> => {
    const run = await svc.produce(T1, params(patch));
    published.length = 0;
    return run;
  };

  /** Retire what is live under the run's key and put a different method there instead. */
  const retuneTheKey = async (): Promise<void> => {
    await models.save(retireModel(model));
    await models.save(modelIn(T1, { method: "moving_average" }, 2));
  };

  // --- Producing -------------------------------------------------------------------

  describe("produce", () => {
    it("produces a forecast over the series and announces it", async () => {
      const run = await svc.produce(T1, params());

      expect(run.status).toBe("completed");
      expect(run.points).toHaveLength(3);
      expect(await repository.findById(T1, run.id)).toEqual(run);
      expect(types()).toEqual(["forecast.run.produced"]);
    });

    it("hands back the standing run rather than writing the same computation twice", async () => {
      const first = await produced();

      // The digest covers the pinned inputs and nothing else, so asking again under another name
      // is the same question, not a second one.
      const again = await svc.produce(T1, params({ producedByUserId: ANALYST }));

      expect(again.id).toBe(first.id);
      expect(await repository.listBySeries(T1, series.id)).toHaveLength(1);
      expect(published).toEqual([]);
    });

    it("produces afresh when the run that answers this question has been retired", async () => {
      const first = await produced();
      const replacement = await produced({ horizon: 2 });
      await svc.supersede(T1, first.id, replacement.id);
      published.length = 0;

      const again = await svc.produce(T1, params());

      expect(again.digest).toBe(first.digest);
      expect(again.id).not.toBe(first.id);
      expect(again.status).toBe("completed");
      expect(types()).toEqual(["forecast.run.produced"]);
    });

    it("refuses a series that is not there, writing nothing", async () => {
      await expect(svc.produce(T1, params({ seriesId: MISSING }))).rejects.toThrow(
        ObservationSeriesNotFoundError,
      );

      expect(await repository.listByTenant(T1)).toEqual([]);
      expect(published).toEqual([]);
    });

    it("refuses a model that is not there, writing nothing", async () => {
      await expect(svc.produce(T1, params({ modelId: MISSING }))).rejects.toThrow(
        ForecastModelNotFoundError,
      );

      expect(await repository.listByTenant(T1)).toEqual([]);
    });

    it("refuses an author who is not a person, writing nothing", async () => {
      await expect(svc.produce(T1, params({ producedByUserId: STRANGER }))).rejects.toThrow(
        PersonNotFoundForForecastError,
      );

      expect(await repository.listByTenant(T1)).toEqual([]);
    });

    it("refuses an assumption attributed to somebody who does not exist", async () => {
      await expect(
        svc.produce(T1, params({ assumptions: [{ ...CONTINUITY, holderId: STRANGER }] })),
      ).rejects.toThrow(PersonNotFoundForForecastError);

      expect(await repository.listByTenant(T1)).toEqual([]);
    });

    it("does not trouble the directory with a holder that could not be a person at all", async () => {
      await expect(
        svc.produce(
          T1,
          params({ assumptions: [{ ...CONTINUITY, holderId: "the finance committee" }] }),
        ),
      ).rejects.toThrow(PersonNotFoundForForecastError);

      // The shape is judged before the directory is asked, so a malformed reference is a 404 about
      // nobody rather than a cast error surfacing from whatever store backs it.
      expect(asked).toEqual([]);
    });
  });

  // --- Supersession ----------------------------------------------------------------

  describe("supersede", () => {
    it("points a retired run at the one that replaced it", async () => {
      const first = await produced();
      const replacement = await produced({ horizon: 2 });

      const next = await svc.supersede(T1, first.id, replacement.id);

      expect(next.status).toBe("superseded");
      expect(next.supersededByRunId).toBe(replacement.id);
      expect(types()).toEqual(["forecast.run.superseded"]);
    });

    it("refuses a replacement that is not there, leaving the run current", async () => {
      const first = await produced();

      await expect(svc.supersede(T1, first.id, MISSING)).rejects.toThrow(ForecastRunNotFoundError);

      expect((await repository.findById(T1, first.id))?.status).toBe("completed");
      expect(published).toEqual([]);
    });
  });

  // --- Re-verification -------------------------------------------------------------

  describe("verify and invalidate", () => {
    it("says a run still reproduces, and changes nothing in saying so", async () => {
      const run = await produced();

      const verdict = await svc.verify(T1, run.id);

      expect(verdict.reproducible).toBe(true);
      expect(verdict.drift).toEqual([]);
      expect(verdict.maxValueDelta).toBe(0);
      expect(await repository.findById(T1, run.id)).toEqual(run);
      expect(published).toEqual([]);
    });

    it("catches a retune published under the run's key", async () => {
      const run = await produced();

      // The shadow resolves the model by key, not by the frozen row the run pinned — which is the
      // only way a comparison could ever disagree with itself.
      await retuneTheKey();
      const verdict = await svc.verify(T1, run.id);

      expect(verdict.reproducible).toBe(false);
      expect(verdict.drift).toContain("model_version_changed");
      expect(verdict.recomputedDigest).not.toBe(verdict.recordedDigest);
    });

    it("records that a run no longer reproduces, on evidence it derived itself", async () => {
      const run = await produced();
      await retuneTheKey();

      const next = await svc.invalidate(T1, run.id);

      expect(next.status).toBe("invalidated");
      expect(next.invalidationDrift).toContain("model_version_changed");
      expect(types()).toEqual(["forecast.run.invalidated"]);
    });

    it("refuses to invalidate a run that still reproduces", async () => {
      const run = await produced();

      await expect(svc.invalidate(T1, run.id)).rejects.toThrow(RunStillReproducesError);

      expect((await repository.findById(T1, run.id))?.status).toBe("completed");
      expect(published).toEqual([]);
    });

    it("names the refusal when the key has versions but none of them is live", async () => {
      const run = await produced();
      await models.save(retireModel(model));

      await expect(svc.verify(T1, run.id)).rejects.toThrow(ModelNotPublishedError);
    });

    it("404s on a run that is not there", async () => {
      await expect(svc.verify(T1, MISSING)).rejects.toThrow(ForecastRunNotFoundError);
    });
  });

  // --- Reading ---------------------------------------------------------------------

  describe("reads", () => {
    it("finds a run by digest, by series, by model and across the tenant", async () => {
      const run = await produced();

      expect(await svc.get(T1, run.id)).toEqual(run);
      expect(await svc.findByDigest(T1, run.digest)).toEqual(run);
      expect(await svc.findCurrentForSeries(T1, series.id)).toEqual(run);
      expect(await svc.listBySeries(T1, series.id)).toEqual([run]);
      expect(await svc.listByModel(T1, model.id)).toEqual([run]);
      expect(await svc.list(T1)).toEqual([run]);
    });

    it("keeps a run out of another tenant's reach", async () => {
      const run = await produced();

      await expect(svc.get(T2, run.id)).rejects.toThrow(ForecastRunNotFoundError);
      expect(await svc.list(T2)).toEqual([]);
      expect(await svc.findByDigest(T2, run.digest)).toBeNull();
    });
  });

  // --- Without a bus ---------------------------------------------------------------

  it("works without an event bus", async () => {
    const quiet = new ForecastRunService({
      repository,
      series: seriesRepository,
      models,
      people: {
        async exists(): Promise<boolean> {
          return true;
        },
      },
    });

    const run = await quiet.produce(T1, params());

    expect(await repository.findById(T1, run.id)).toEqual(run);
    expect(published).toEqual([]);
  });
});
