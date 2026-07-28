import { beforeEach, describe, expect, it } from "vitest";

import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateSeriesKeyError,
  ObservationSeriesNotFoundError,
  OrganizationNotFoundForForecastError,
  SeriesSubjectNotFoundError,
} from "./errors";
import type { ObservationSeries, ObservationSeriesParams } from "./observation-series";
import { ObservationSeriesService } from "./observation-series-service";
import { InMemoryObservationSeriesRepository } from "./ports";

const T1 = "11111111-1111-4111-8111-111111111111" as TenantId;
const T2 = "22222222-2222-4222-8222-222222222222" as TenantId;
const ORG = "33333333-3333-4333-8333-333333333333" as Uuid;
const OTHER_ORG = "44444444-4444-4444-8444-444444444444" as Uuid;
const UNKNOWN_ORG = "77777777-7777-4777-8777-777777777777" as Uuid;
const MISSING = "99999999-9999-4999-8999-999999999999" as Uuid;

describe("ObservationSeriesService", () => {
  let repository: InMemoryObservationSeriesRepository;
  let organizations: Set<string>;
  let subjects: Set<string>;
  let published: DomainEvent[];
  let svc: ObservationSeriesService;

  beforeEach(() => {
    repository = new InMemoryObservationSeriesRepository();
    organizations = new Set<string>([ORG, OTHER_ORG]);
    subjects = new Set<string>(["attendance/grade-7"]);
    published = [];
    svc = new ObservationSeriesService({
      repository,
      organizations: {
        async exists(_tenantId: TenantId, organizationId: Uuid): Promise<boolean> {
          return organizations.has(organizationId);
        },
      },
      subjects: {
        async exists(
          _tenantId: TenantId,
          sourceDomain: string,
          subjectRef: string,
        ): Promise<boolean> {
          return subjects.has(`${sourceDomain}/${subjectRef}`);
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

  const params = (patch: Partial<ObservationSeriesParams> = {}): ObservationSeriesParams => ({
    tenantId: T1,
    organizationId: ORG,
    seriesKey: "attendance.rate.grade7",
    metricKey: "attendance.rate",
    sourceDomain: "attendance",
    subjectRef: null,
    grain: "month",
    direction: "higher_is_better",
    ...patch,
  });

  /** A declared series with the announcement already drained, so a test asserts only its own events. */
  const declared = async (
    patch: Partial<ObservationSeriesParams> = {},
  ): Promise<ObservationSeries> => {
    const series = await svc.declare(params(patch));
    published.length = 0;
    return series;
  };

  // --- Declaration -----------------------------------------------------------------

  describe("declare", () => {
    it("saves the series and announces it", async () => {
      const series = await svc.declare(params());

      expect(series.status).toBe("active");
      expect(series.observations).toEqual([]);
      expect(await repository.findById(T1, series.id)).toEqual(series);
      expect(types()).toEqual(["forecast.series.declared"]);
    });

    it("refuses an organization that does not exist, writing nothing", async () => {
      await expect(svc.declare(params({ organizationId: UNKNOWN_ORG }))).rejects.toThrow(
        OrganizationNotFoundForForecastError,
      );

      expect(await repository.listByTenant(T1)).toEqual([]);
      expect(published).toEqual([]);
    });

    it("refuses a subject the owning domain does not know, writing nothing", async () => {
      await expect(svc.declare(params({ subjectRef: "grade-9" }))).rejects.toThrow(
        SeriesSubjectNotFoundError,
      );

      expect(await repository.listByTenant(T1)).toEqual([]);
      expect(published).toEqual([]);
    });

    it("accepts a subject the owning domain knows", async () => {
      const series = await svc.declare(params({ subjectRef: "grade-7" }));

      expect(series.subjectRef).toBe("grade-7");
      expect(await repository.listBySubject(T1, "attendance", "grade-7")).toEqual([series]);
    });

    it("does not consult the subject directory for a series that is about nobody", async () => {
      // Emptied, so a series naming a subject could not pass. One naming none never asks.
      subjects.clear();

      const series = await svc.declare(params({ subjectRef: null }));

      expect(series.subjectRef).toBeNull();
    });

    it("sees through spelling to refuse a key the organization already has", async () => {
      await declared({ seriesKey: "attendance.rate.grade7" });

      // The uniqueness rule is checked on the key the aggregate normalized, not on the string sent.
      await expect(
        svc.declare(params({ seriesKey: "  Attendance.Rate.Grade7  " })),
      ).rejects.toThrow(DuplicateSeriesKeyError);

      expect(await repository.listByTenant(T1)).toHaveLength(1);
      expect(published).toEqual([]);
    });

    it("permits the same key in another organization", async () => {
      await declared();
      const elsewhere = await svc.declare(params({ organizationId: OTHER_ORG }));

      expect(elsewhere.seriesKey).toBe("attendance.rate.grade7");
      expect(await repository.listByTenant(T1)).toHaveLength(2);
    });

    it("permits the same key in another tenant", async () => {
      await declared();
      const theirs = await svc.declare(params({ tenantId: T2 }));

      expect(await repository.listByTenant(T2)).toEqual([theirs]);
    });
  });

  // --- Observations ----------------------------------------------------------------

  describe("record, correct and withdraw", () => {
    it("appends readings and announces them", async () => {
      const series = await declared();

      const next = await svc.record(T1, series.id, [
        { period: 0, value: 91, label: "2026-01" },
        { period: 1, value: 92, label: "2026-02" },
      ]);

      expect(next.observations).toHaveLength(2);
      expect(next.version).toBeGreaterThan(series.version);
      expect(await repository.findById(T1, series.id)).toEqual(next);
      expect(types()).toEqual(["forecast.series.observed"]);
    });

    it("announces a correction apart from an append", async () => {
      const series = await declared();
      await svc.record(T1, series.id, [{ period: 0, value: 91, label: "2026-01" }]);
      published.length = 0;

      const next = await svc.correct(T1, series.id, 0, 93, "2026-01 revised");

      expect(next.observations[0]?.value).toBe(93);
      expect(next.observations[0]?.label).toBe("2026-01 revised");
      expect(types()).toEqual(["forecast.series.observation_corrected"]);
    });

    it("takes a reading back entirely", async () => {
      const series = await declared();
      await svc.record(T1, series.id, [
        { period: 0, value: 91, label: "2026-01" },
        { period: 1, value: 92, label: "2026-02" },
      ]);
      published.length = 0;

      const next = await svc.withdraw(T1, series.id, 1);

      expect(next.observations.map((observation) => observation.period)).toEqual([0]);
      expect(types()).toEqual(["forecast.series.observation_withdrawn"]);
    });

    it("404s on a series that is not there", async () => {
      await expect(
        svc.record(T1, MISSING, [{ period: 0, value: 91, label: "2026-01" }]),
      ).rejects.toThrow(ObservationSeriesNotFoundError);
    });
  });

  // --- Lifecycle -------------------------------------------------------------------

  describe("lifecycle", () => {
    it("declares and withdraws the season", async () => {
      const series = await declared();

      expect((await svc.declareCycle(T1, series.id, 12)).cycleLength).toBe(12);
      expect((await svc.declareCycle(T1, series.id, null)).cycleLength).toBeNull();
      expect(types()).toEqual(["forecast.series.cycle_declared", "forecast.series.cycle_declared"]);
    });

    it("closes a series and reopens it, keeping what was already measured", async () => {
      const series = await declared();
      await svc.record(T1, series.id, [{ period: 0, value: 91, label: "2026-01" }]);
      published.length = 0;

      const closed = await svc.close(T1, series.id);
      expect(closed.status).toBe("closed");
      expect(closed.observations).toHaveLength(1);

      const reopened = await svc.reopen(T1, series.id);
      expect(reopened.status).toBe("active");
      expect(reopened.observations).toHaveLength(1);
      expect(types()).toEqual(["forecast.series.closed", "forecast.series.reopened"]);
    });
  });

  // --- Reading ---------------------------------------------------------------------

  describe("reads", () => {
    it("finds a series by key, by metric, by subject and across the tenant", async () => {
      subjects.add("attendance/grade-8");
      const seven = await declared({ subjectRef: "grade-7" });
      const eight = await declared({
        seriesKey: "attendance.rate.grade8",
        subjectRef: "grade-8",
      });

      expect(await svc.findByKey(T1, ORG, "attendance.rate.grade7")).toEqual(seven);
      expect(await svc.listByMetric(T1, "attendance.rate")).toEqual([seven, eight]);
      expect(await svc.listBySubject(T1, "attendance", "grade-8")).toEqual([eight]);
      expect(await svc.list(T1)).toHaveLength(2);
    });

    it("keeps a series out of another tenant's reach", async () => {
      const series = await declared();

      await expect(svc.get(T2, series.id)).rejects.toThrow(ObservationSeriesNotFoundError);
      expect(await svc.list(T2)).toEqual([]);
    });
  });

  // --- Without a bus ---------------------------------------------------------------

  it("works without an event bus", async () => {
    const quiet = new ObservationSeriesService({
      repository,
      organizations: {
        async exists(): Promise<boolean> {
          return true;
        },
      },
      subjects: {
        async exists(): Promise<boolean> {
          return true;
        },
      },
    });

    const series = await quiet.declare(params());

    expect(await repository.findById(T1, series.id)).toEqual(series);
    expect(published).toEqual([]);
  });
});
