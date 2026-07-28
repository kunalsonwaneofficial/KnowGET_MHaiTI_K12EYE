import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type AssumptionView,
  type ConfidenceLevel,
  type DriftCode,
  type ForecastMethod,
  type ForecastPoint,
  type ForecastRun,
  type ForecastRunRepository,
  type ResolvedProjectionParameters,
  type RunStatus,
  type UncertaintyAssessment,
} from "@knowget/predictive-intelligence";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface ForecastRunRow {
  id: string;
  tenantId: string;
  organizationId: string;
  seriesId: string;
  seriesKey: string;
  seriesVersion: number;
  modelId: string;
  modelKey: string;
  modelVersion: number;
  method: string;
  parameters: unknown;
  horizon: number;
  confidenceLevels: number[];
  assumptions: unknown;
  points: unknown;
  uncertainty: unknown;
  fallbackPeriods: number[];
  digest: string;
  canonical: string;
  status: string;
  producedByUserId: string | null;
  producedAt: string;
  supersededByRunId: string | null;
  supersededAt: string | null;
  invalidatedAt: string | null;
  invalidationDrift: string[];
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ForecastRunRow): ForecastRun {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    seriesId: row.seriesId as Uuid,
    seriesKey: row.seriesKey,
    seriesVersion: row.seriesVersion,
    modelId: row.modelId as Uuid,
    modelKey: row.modelKey,
    modelVersion: row.modelVersion,
    method: row.method as ForecastMethod,
    parameters: row.parameters as ResolvedProjectionParameters,
    horizon: row.horizon,
    confidenceLevels: row.confidenceLevels as ConfidenceLevel[],
    assumptions: (row.assumptions as AssumptionView[]) ?? [],
    points: (row.points as ForecastPoint[]) ?? [],
    uncertainty: row.uncertainty as UncertaintyAssessment,
    fallbackPeriods: row.fallbackPeriods,
    digest: row.digest,
    canonical: row.canonical,
    status: row.status as RunStatus,
    producedByUserId: (row.producedByUserId as Uuid | null) ?? null,
    producedAt: row.producedAt as ISODateString,
    supersededByRunId: (row.supersededByRunId as Uuid | null) ?? null,
    supersededAt: (row.supersededAt as ISODateString | null) ?? null,
    invalidatedAt: (row.invalidatedAt as ISODateString | null) ?? null,
    invalidationDrift: row.invalidationDrift as DriftCode[],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(run: ForecastRun) {
  return {
    tenantId: run.tenantId,
    organizationId: run.organizationId,
    seriesId: run.seriesId,
    seriesKey: run.seriesKey,
    seriesVersion: run.seriesVersion,
    modelId: run.modelId,
    modelKey: run.modelKey,
    modelVersion: run.modelVersion,
    method: run.method,
    parameters: JSON.parse(JSON.stringify(run.parameters)),
    horizon: run.horizon,
    confidenceLevels: [...run.confidenceLevels],
    assumptions: JSON.parse(JSON.stringify(run.assumptions)),
    points: JSON.parse(JSON.stringify(run.points)),
    uncertainty: JSON.parse(JSON.stringify(run.uncertainty)),
    fallbackPeriods: [...run.fallbackPeriods],
    digest: run.digest,
    canonical: run.canonical,
    status: run.status,
    producedByUserId: run.producedByUserId,
    producedAt: run.producedAt,
    supersededByRunId: run.supersededByRunId,
    supersededAt: run.supersededAt,
    invalidatedAt: run.invalidatedAt,
    invalidationDrift: [...run.invalidationDrift],
  };
}

/**
 * Prisma-backed {@link ForecastRunRepository} (RLS via {@link withTenant}).
 *
 * The pinned inputs are columns and JSONB rather than references, and that is the contract's reproducibility
 * rule expressed in DDL. A reference resolves to today's answer, and a run is a claim about the day it was
 * made; a `series_id` re-read three years later gives a history that has since taken four corrections, so what
 * is stored is the series key *and the version*, the model key *and the version*, the resolved parameters, the
 * horizon, the levels and the assumptions. `canonical` is kept beside `digest` for the same reason a bank keeps
 * the statement beside the balance: when a re-verification disagrees, the answer should be a diff.
 *
 * `producedAt` is written by the domain through `toIso`, so it is fixed-width ISO-8601 text and lexicographic
 * ordering on it is chronological ordering. Every `orderBy` below relies on that and on nothing else.
 *
 * There is no `remove`. Superseding and invalidating are the ways out, and both leave what was projected — and
 * therefore what was decided on the strength of it — legible afterwards.
 */
export class PrismaForecastRunRepository implements ForecastRunRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<ForecastRun | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.forecastRun.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  /**
   * The reproducibility lookup: has this exact question already been answered?
   *
   * The digest is deliberately not unique — a superseded run and the fresh one answering the same question
   * share it — so the ordering is the whole of the semantics. A completed run is preferred over a superseded or
   * invalidated one whatever the dates say, because the caller is asking for an answer it can still use, and
   * only within that class does recency decide. Prisma cannot express `ORDER BY CASE WHEN`, so the preference
   * is two queries rather than one sort, which produces exactly the ordering the port prescribes.
   */
  findByDigest(tenantId: TenantId, digest: string): Promise<ForecastRun | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const completed = await tx.forecastRun.findFirst({
        where: { digest, status: "completed" },
        orderBy: { producedAt: "desc" },
      });
      if (completed) return toDomain(completed);

      const any = await tx.forecastRun.findFirst({
        where: { digest },
        orderBy: { producedAt: "desc" },
      });
      return any ? toDomain(any) : null;
    });
  }

  /** The forecast currently standing for a series. Superseded and invalidated runs are not candidates. */
  findLatestForSeries(tenantId: TenantId, seriesId: Uuid): Promise<ForecastRun | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.forecastRun.findFirst({
        where: { seriesId, status: "completed" },
        orderBy: { producedAt: "desc" },
      });
      return row ? toDomain(row) : null;
    });
  }

  listBySeries(tenantId: TenantId, seriesId: Uuid): Promise<ForecastRun[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.forecastRun.findMany({ where: { seriesId } });
      return rows.map(toDomain);
    });
  }

  listByModel(tenantId: TenantId, modelId: Uuid): Promise<ForecastRun[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.forecastRun.findMany({ where: { modelId } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<ForecastRun[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.forecastRun.findMany();
      return rows.map(toDomain);
    });
  }

  save(run: ForecastRun): Promise<void> {
    return withTenant(this.db, run.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(run);
      await tx.forecastRun.upsert({
        where: { id: run.id },
        create: { id: run.id, ...fields },
        update: fields,
      });
    });
  }
}
