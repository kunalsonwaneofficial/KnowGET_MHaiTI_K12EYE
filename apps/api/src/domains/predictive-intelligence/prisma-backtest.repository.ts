import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type AccuracyScores,
  type Backtest,
  type BacktestRepository,
  type ForecastMethod,
  type ResolvedProjectionParameters,
  type ScoredPoint,
} from "@knowget/predictive-intelligence";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface BacktestRow {
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
  holdoutSize: number;
  trainingCount: number;
  firstHoldoutPeriod: number;
  lastHoldoutPeriod: number;
  scored: unknown;
  scores: unknown;
  baselineMeanAbsoluteError: number;
  publishable: boolean;
  ranByUserId: string | null;
  ranAt: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: BacktestRow): Backtest {
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
    holdoutSize: row.holdoutSize,
    trainingCount: row.trainingCount,
    firstHoldoutPeriod: row.firstHoldoutPeriod,
    lastHoldoutPeriod: row.lastHoldoutPeriod,
    scored: (row.scored as ScoredPoint[]) ?? [],
    scores: row.scores as AccuracyScores,
    baselineMeanAbsoluteError: row.baselineMeanAbsoluteError,
    publishable: row.publishable,
    ranByUserId: (row.ranByUserId as Uuid | null) ?? null,
    ranAt: row.ranAt as ISODateString,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(backtest: Backtest) {
  return {
    tenantId: backtest.tenantId,
    organizationId: backtest.organizationId,
    seriesId: backtest.seriesId,
    seriesKey: backtest.seriesKey,
    seriesVersion: backtest.seriesVersion,
    modelId: backtest.modelId,
    modelKey: backtest.modelKey,
    modelVersion: backtest.modelVersion,
    method: backtest.method,
    parameters: JSON.parse(JSON.stringify(backtest.parameters)),
    holdoutSize: backtest.holdoutSize,
    trainingCount: backtest.trainingCount,
    firstHoldoutPeriod: backtest.firstHoldoutPeriod,
    lastHoldoutPeriod: backtest.lastHoldoutPeriod,
    scored: JSON.parse(JSON.stringify(backtest.scored)),
    scores: JSON.parse(JSON.stringify(backtest.scores)),
    baselineMeanAbsoluteError: backtest.baselineMeanAbsoluteError,
    publishable: backtest.publishable,
    ranByUserId: backtest.ranByUserId,
    ranAt: backtest.ranAt,
  };
}

/**
 * Prisma-backed {@link BacktestRepository} (RLS via {@link withTenant}).
 *
 * `scored` keeps every projected point beside what actually happened — the atoms each score was computed from —
 * so a verdict can be re-derived rather than trusted, and `publishable` is stored as it was frozen at scoring
 * rather than recomputed on read, so the verdict and its evidence can never drift apart.
 *
 * `findLatestForPair` deliberately does not filter on `publishable`. The question it answers is "what does the
 * most recent scoring of this method against this history say", and a model that just failed its holdout is
 * precisely the case where the honest answer is the failing score rather than the last passing one. Publication
 * checks the verdict itself; hiding failures here would make a retune look like a first attempt.
 *
 * There is no `remove` and no update path in practice — a retune is scored beside the first reading rather than
 * over it, so the sequence of what a method was worth stays visible.
 */
export class PrismaBacktestRepository implements BacktestRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Backtest | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.backtest.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  /** The most recent scoring of one model against one series, passing or failing. */
  findLatestForPair(tenantId: TenantId, seriesId: Uuid, modelId: Uuid): Promise<Backtest | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.backtest.findFirst({
        where: { seriesId, modelId },
        orderBy: { ranAt: "desc" },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByModel(tenantId: TenantId, modelId: Uuid): Promise<Backtest[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.backtest.findMany({ where: { modelId } });
      return rows.map(toDomain);
    });
  }

  listBySeries(tenantId: TenantId, seriesId: Uuid): Promise<Backtest[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.backtest.findMany({ where: { seriesId } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Backtest[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.backtest.findMany();
      return rows.map(toDomain);
    });
  }

  save(backtest: Backtest): Promise<void> {
    return withTenant(this.db, backtest.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(backtest);
      await tx.backtest.upsert({
        where: { id: backtest.id },
        create: { id: backtest.id, ...fields },
        update: fields,
      });
    });
  }
}
