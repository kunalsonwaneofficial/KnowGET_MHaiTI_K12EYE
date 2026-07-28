import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type MetricDirection,
  type Observation,
  type ObservationSeries,
  type ObservationSeriesRepository,
  type PeriodGrain,
  type SeriesStatus,
} from "@knowget/predictive-intelligence";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface ObservationSeriesRow {
  id: string;
  tenantId: string;
  organizationId: string;
  seriesKey: string;
  metricKey: string;
  sourceDomain: string;
  subjectRef: string | null;
  grain: string;
  direction: string;
  cycleLength: number | null;
  unit: string | null;
  observations: unknown;
  version: number;
  status: string;
  closedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ObservationSeriesRow): ObservationSeries {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    seriesKey: row.seriesKey,
    metricKey: row.metricKey,
    sourceDomain: row.sourceDomain,
    subjectRef: row.subjectRef,
    grain: row.grain as PeriodGrain,
    direction: row.direction as MetricDirection,
    cycleLength: row.cycleLength,
    unit: row.unit,
    observations: (row.observations as Observation[]) ?? [],
    version: row.version,
    status: row.status as SeriesStatus,
    closedAt: (row.closedAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(series: ObservationSeries) {
  return {
    tenantId: series.tenantId,
    organizationId: series.organizationId,
    seriesKey: series.seriesKey,
    metricKey: series.metricKey,
    sourceDomain: series.sourceDomain,
    subjectRef: series.subjectRef,
    grain: series.grain,
    direction: series.direction,
    cycleLength: series.cycleLength,
    unit: series.unit,
    observations: JSON.parse(JSON.stringify(series.observations)),
    version: series.version,
    status: series.status,
    closedAt: series.closedAt,
  };
}

/**
 * Prisma-backed {@link ObservationSeriesRepository} (RLS via {@link withTenant}).
 *
 * The observations are a JSONB column on the series row and are loaded and saved with it, which is the one
 * decision in this adapter that is not a matter of taste. `version` identifies the whole body of readings a
 * forecast run pinned, and a reading written on its own would move the history a run claims to have been
 * computed from without moving the number that says it moved — leaving a digest attesting to something no
 * longer true, which is worse than no digest because people trust it. A child table would make that failure a
 * routine one, so there is no child table. A series is bounded by the periods an institution actually measures,
 * and the aggregate is read whole for every operation on it in any case.
 *
 * There is no `remove`, and the port declares none. Withdrawing a reading and closing a series are how history
 * is corrected here, both visibly; a deleted series would take the record of what was measured with it.
 */
export class PrismaObservationSeriesRepository implements ObservationSeriesRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<ObservationSeries | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.observationSeries.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  findByKey(
    tenantId: TenantId,
    organizationId: Uuid,
    seriesKey: string,
  ): Promise<ObservationSeries | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.observationSeries.findFirst({ where: { organizationId, seriesKey } });
      return row ? toDomain(row) : null;
    });
  }

  listByMetric(tenantId: TenantId, metricKey: string): Promise<ObservationSeries[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.observationSeries.findMany({ where: { metricKey } });
      return rows.map(toDomain);
    });
  }

  /**
   * Every series about one record in another domain. The `(tenant, source_domain, subject_ref)` index backs it,
   * and it is the read that answers "what is the institution forecasting about this thing" — which is how a
   * grade section, a cost centre or a route comes to have a predictive profile without any domain owning one.
   */
  listBySubject(
    tenantId: TenantId,
    sourceDomain: string,
    subjectRef: string,
  ): Promise<ObservationSeries[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.observationSeries.findMany({ where: { sourceDomain, subjectRef } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<ObservationSeries[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.observationSeries.findMany();
      return rows.map(toDomain);
    });
  }

  save(series: ObservationSeries): Promise<void> {
    return withTenant(this.db, series.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(series);
      await tx.observationSeries.upsert({
        where: { id: series.id },
        create: { id: series.id, ...fields },
        update: fields,
      });
    });
  }
}
