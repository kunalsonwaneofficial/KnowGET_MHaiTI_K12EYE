import { beforeEach, describe, expect, it } from "vitest";

import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import type { Backtest } from "./backtest";
import { runBacktest } from "./backtest";
import {
  BacktestNotFoundError,
  DuplicateModelVersionError,
  ForecastModelNotFoundError,
  ModelNotPublishableError,
  OrganizationNotFoundForForecastError,
  PublishedModelImmutableError,
} from "./errors";
import type { ForecastModel, ForecastModelParams } from "./forecast-model";
import { ForecastModelService } from "./forecast-model-service";
import type { ObservationSeries } from "./observation-series";
import { declareObservationSeries, recordObservations } from "./observation-series";
import { InMemoryBacktestRepository, InMemoryForecastModelRepository } from "./ports";

const T1 = "11111111-1111-4111-8111-111111111111" as TenantId;
const T2 = "22222222-2222-4222-8222-222222222222" as TenantId;
const ORG = "33333333-3333-4333-8333-333333333333" as Uuid;
const UNKNOWN_ORG = "77777777-7777-4777-8777-777777777777" as Uuid;
const ANALYST = "55555555-5555-4555-8555-555555555555" as Uuid;
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

describe("ForecastModelService", () => {
  let repository: InMemoryForecastModelRepository;
  let backtests: InMemoryBacktestRepository;
  let organizations: Set<string>;
  let published: DomainEvent[];
  let svc: ForecastModelService;

  beforeEach(() => {
    repository = new InMemoryForecastModelRepository();
    backtests = new InMemoryBacktestRepository();
    organizations = new Set<string>([ORG]);
    published = [];
    svc = new ForecastModelService({
      repository,
      backtests,
      organizations: {
        async exists(_tenantId: TenantId, organizationId: Uuid): Promise<boolean> {
          return organizations.has(organizationId);
        },
      },
      events: {
        async publish(event: DomainEvent): Promise<void> {
          published.push(event);
        },
      },
    });
  });

  const types = (): readonly string[] => published.map((event) => event.type);

  const params = (patch: Partial<ForecastModelParams> = {}): ForecastModelParams => ({
    tenantId: T1,
    organizationId: ORG,
    modelKey: "attendance.linear",
    name: "Attendance linear trend",
    method: "linear_trend",
    ...patch,
  });

  /** A drafted model with the announcement already drained. */
  const drafted = async (patch: Partial<ForecastModelParams> = {}): Promise<ForecastModel> => {
    const model = await svc.draft(params(patch));
    published.length = 0;
    return model;
  };

  /** Score a model against the ramp and file the reading, which is what publication will cite. */
  const evidenceFor = async (model: ForecastModel): Promise<Backtest> => {
    const backtest = runBacktest({
      series: seriesIn(model.tenantId),
      model,
      holdoutSize: 3,
      ranByUserId: ANALYST,
    });
    await backtests.save(backtest);
    return backtest;
  };

  // --- Authoring -------------------------------------------------------------------

  describe("draft and amend", () => {
    it("saves a draft with no version yet and announces it", async () => {
      const model = await svc.draft(params());

      expect(model.status).toBe("draft");
      expect(model.version).toBe(0);
      expect(await repository.findById(T1, model.id)).toEqual(model);
      expect(types()).toEqual(["forecast.model.drafted"]);
    });

    it("refuses an organization that does not exist, writing nothing", async () => {
      await expect(svc.draft(params({ organizationId: UNKNOWN_ORG }))).rejects.toThrow(
        OrganizationNotFoundForForecastError,
      );

      expect(await repository.listByTenant(T1)).toEqual([]);
      expect(published).toEqual([]);
    });

    it("restates what a draft says", async () => {
      const model = await drafted();

      const next = await svc.amend(T1, model.id, { name: "Attendance trend, retuned" });

      expect(next.name).toBe("Attendance trend, retuned");
      expect(await repository.findById(T1, model.id)).toEqual(next);
      expect(types()).toEqual(["forecast.model.amended"]);
    });

    it("404s on a model that is not there", async () => {
      await expect(svc.amend(T1, MISSING, { name: "Nothing" })).rejects.toThrow(
        ForecastModelNotFoundError,
      );
    });
  });

  // --- Publication -----------------------------------------------------------------

  describe("publish", () => {
    it("publishes on a backtest that earned it, minting the first version", async () => {
      const model = await drafted();
      const evidence = await evidenceFor(model);

      const live = await svc.publish(T1, model.id, { backtestId: evidence.id });

      expect(live.status).toBe("published");
      expect(live.version).toBe(1);
      expect(await repository.findPublishedByKey(T1, "attendance.linear")).toEqual(live);
      expect(types()).toEqual(["forecast.model.published"]);
    });

    it("refuses a model whose evidence did not earn it, and consumes no version", async () => {
      const model = await drafted({ method: "naive" });
      const weak = await evidenceFor(model);

      await expect(svc.publish(T1, model.id, { backtestId: weak.id })).rejects.toThrow(
        ModelNotPublishableError,
      );
      expect((await repository.findById(T1, model.id))?.status).toBe("draft");
      expect(published).toEqual([]);

      // The refusal cost the key nothing: the retuned method gets the number it would have had.
      const retuned = await svc.amend(T1, model.id, { method: "linear_trend" });
      const earned = await evidenceFor(retuned);

      expect((await svc.publish(T1, model.id, { backtestId: earned.id })).version).toBe(1);
    });

    it("refuses evidence recorded against another model", async () => {
      const mine = await drafted();
      const other = await drafted({ modelKey: "attendance.other", name: "Another method" });
      const theirs = await evidenceFor(other);

      await expect(svc.publish(T1, mine.id, { backtestId: theirs.id })).rejects.toThrow(
        BacktestNotFoundError,
      );
      expect((await repository.findById(T1, mine.id))?.status).toBe("draft");
    });

    it("refuses a backtest that is not there at all", async () => {
      const model = await drafted();

      await expect(svc.publish(T1, model.id, { backtestId: MISSING })).rejects.toThrow(
        BacktestNotFoundError,
      );
    });

    it("honours an explicit version and refuses one already taken", async () => {
      const first = await drafted();
      await svc.publish(T1, first.id, { backtestId: (await evidenceFor(first)).id, version: 5 });

      const second = await svc.revise(T1, first.id);
      const evidence = await evidenceFor(second);

      await expect(
        svc.publish(T1, second.id, { backtestId: evidence.id, version: 5 }),
      ).rejects.toThrow(DuplicateModelVersionError);
    });

    it("counts a retired version as taken", async () => {
      const first = await drafted();
      await svc.publish(T1, first.id, { backtestId: (await evidenceFor(first)).id });
      await svc.retire(T1, first.id);

      const second = await svc.revise(T1, first.id);
      const live = await svc.publish(T1, second.id, {
        backtestId: (await evidenceFor(second)).id,
      });

      expect(live.version).toBe(2);
    });
  });

  // --- Lifecycle -------------------------------------------------------------------

  describe("retire, revise and discard", () => {
    it("retires a published version", async () => {
      const model = await drafted();
      await svc.publish(T1, model.id, { backtestId: (await evidenceFor(model)).id });
      published.length = 0;

      expect((await svc.retire(T1, model.id)).status).toBe("retired");
      expect(types()).toEqual(["forecast.model.retired"]);
    });

    it("revises a published version into a fresh draft, leaving the published row untouched", async () => {
      const model = await drafted();
      const live = await svc.publish(T1, model.id, { backtestId: (await evidenceFor(model)).id });
      published.length = 0;

      const revision = await svc.revise(T1, model.id, { name: "Attendance trend, mark two" });

      expect(revision.id).not.toBe(live.id);
      expect(revision.modelKey).toBe(live.modelKey);
      expect(revision.status).toBe("draft");
      expect(revision.version).toBe(0);
      expect(await repository.findById(T1, live.id)).toEqual(live);
      expect(types()).toEqual(["forecast.model.drafted"]);
    });

    it("discards a draft that was never published", async () => {
      const model = await drafted();

      await svc.discard(T1, model.id);

      expect(await repository.findById(T1, model.id)).toBeNull();
    });

    it("refuses to discard a version a run could have pinned", async () => {
      const model = await drafted();
      await svc.publish(T1, model.id, { backtestId: (await evidenceFor(model)).id });

      await expect(svc.discard(T1, model.id)).rejects.toThrow(PublishedModelImmutableError);
      expect(await repository.findById(T1, model.id)).not.toBeNull();
    });
  });

  // --- Reading ---------------------------------------------------------------------

  describe("reads", () => {
    it("finds the live version, an exact version, the lineage and the tenant's models", async () => {
      const first = await drafted();
      const live = await svc.publish(T1, first.id, { backtestId: (await evidenceFor(first)).id });
      const revision = await svc.revise(T1, first.id);

      expect(await svc.findPublished(T1, "attendance.linear")).toEqual(live);
      expect(await svc.findVersion(T1, "attendance.linear", 1)).toEqual(live);
      expect(await svc.findVersion(T1, "attendance.linear", 9)).toBeNull();
      expect(await svc.listVersions(T1, "attendance.linear")).toHaveLength(2);
      expect(await svc.listPublished(T1)).toEqual([live]);
      expect((await svc.list(T1)).map((model) => model.id)).toContain(revision.id);
    });

    it("keeps a model out of another tenant's reach", async () => {
      const model = await drafted();

      await expect(svc.get(T2, model.id)).rejects.toThrow(ForecastModelNotFoundError);
      expect(await svc.list(T2)).toEqual([]);
      expect(await svc.findPublished(T2, "attendance.linear")).toBeNull();
    });
  });

  // --- Without a bus ---------------------------------------------------------------

  it("works without an event bus", async () => {
    const quiet = new ForecastModelService({
      repository,
      backtests,
      organizations: {
        async exists(): Promise<boolean> {
          return true;
        },
      },
    });

    const model = await quiet.draft(params());

    expect(await repository.findById(T1, model.id)).toEqual(model);
    expect(published).toEqual([]);
  });
});
