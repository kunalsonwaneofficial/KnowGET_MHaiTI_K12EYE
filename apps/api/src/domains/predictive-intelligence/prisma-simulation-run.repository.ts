import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type ForecastMethod,
  type LeverView,
  type SimulationPoint,
  type SimulationRun,
  type SimulationRunRepository,
  type SimulationStatus,
  type UncertaintyGrade,
} from "@knowget/predictive-intelligence";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface SimulationRunRow {
  id: string;
  tenantId: string;
  organizationId: string;
  scenarioId: string;
  scenarioKey: string;
  scenarioVersion: number;
  forecastRunId: string;
  forecastRunDigest: string;
  seriesKey: string;
  seriesVersion: number;
  modelKey: string;
  modelVersion: number;
  method: string;
  horizon: number;
  levers: unknown;
  variedAssumptionKeys: string[];
  points: unknown;
  totalBaseline: number;
  totalScenario: number;
  totalDelta: number;
  peakDelta: number;
  inheritedUncertainty: string;
  overridden: boolean;
  unappliedLeverKeys: string[];
  status: string;
  supersededByRunId: string | null;
  supersededAt: string | null;
  ranByUserId: string | null;
  ranAt: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: SimulationRunRow): SimulationRun {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    scenarioId: row.scenarioId as Uuid,
    scenarioKey: row.scenarioKey,
    scenarioVersion: row.scenarioVersion,
    forecastRunId: row.forecastRunId as Uuid,
    forecastRunDigest: row.forecastRunDigest,
    seriesKey: row.seriesKey,
    seriesVersion: row.seriesVersion,
    modelKey: row.modelKey,
    modelVersion: row.modelVersion,
    method: row.method as ForecastMethod,
    horizon: row.horizon,
    levers: (row.levers as LeverView[]) ?? [],
    variedAssumptionKeys: row.variedAssumptionKeys,
    points: (row.points as SimulationPoint[]) ?? [],
    totalBaseline: row.totalBaseline,
    totalScenario: row.totalScenario,
    totalDelta: row.totalDelta,
    peakDelta: row.peakDelta,
    inheritedUncertainty: row.inheritedUncertainty as UncertaintyGrade,
    overridden: row.overridden,
    unappliedLeverKeys: row.unappliedLeverKeys,
    status: row.status as SimulationStatus,
    supersededByRunId: (row.supersededByRunId as Uuid | null) ?? null,
    supersededAt: (row.supersededAt as ISODateString | null) ?? null,
    ranByUserId: (row.ranByUserId as Uuid | null) ?? null,
    ranAt: row.ranAt as ISODateString,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(run: SimulationRun) {
  return {
    tenantId: run.tenantId,
    organizationId: run.organizationId,
    scenarioId: run.scenarioId,
    scenarioKey: run.scenarioKey,
    scenarioVersion: run.scenarioVersion,
    forecastRunId: run.forecastRunId,
    forecastRunDigest: run.forecastRunDigest,
    seriesKey: run.seriesKey,
    seriesVersion: run.seriesVersion,
    modelKey: run.modelKey,
    modelVersion: run.modelVersion,
    method: run.method,
    horizon: run.horizon,
    levers: JSON.parse(JSON.stringify(run.levers)),
    variedAssumptionKeys: [...run.variedAssumptionKeys],
    points: JSON.parse(JSON.stringify(run.points)),
    totalBaseline: run.totalBaseline,
    totalScenario: run.totalScenario,
    totalDelta: run.totalDelta,
    peakDelta: run.peakDelta,
    inheritedUncertainty: run.inheritedUncertainty,
    overridden: run.overridden,
    unappliedLeverKeys: [...run.unappliedLeverKeys],
    status: run.status,
    supersededByRunId: run.supersededByRunId,
    supersededAt: run.supersededAt,
    ranByUserId: run.ranByUserId,
    ranAt: run.ranAt,
  };
}

/**
 * Prisma-backed {@link SimulationRunRepository} (RLS via {@link withTenant}).
 *
 * Both sides of the comparison are snapshotted rather than referenced. The scenario contributes its key and the
 * lever-set version it was published at; the baseline contributes its whole pinned identity down to
 * `forecast_run_digest`, and that digest is the load-bearing one — once the baseline is superseded, the run id
 * still resolves but no longer says what was forecast, while the digest still does.
 *
 * `listStandingOn` reads the reverse direction through the `(tenant, forecast_run_id)` index, and it is the
 * query the domain needs at its most consequential moment: when a forecast is invalidated, the institution has
 * to be told which explored outcomes just stopped meaning what they said. Without that index that question is a
 * scan, and a question that is expensive to ask is a question that stops being asked.
 *
 * There is no `remove`. A newer outcome supersedes an older one; nothing is overwritten and nothing is dropped.
 */
export class PrismaSimulationRunRepository implements SimulationRunRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<SimulationRun | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.simulationRun.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  /** The outcome currently standing for a case. Superseded ones are history, not candidates. */
  findLatestForScenario(tenantId: TenantId, scenarioId: Uuid): Promise<SimulationRun | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.simulationRun.findFirst({
        where: { scenarioId, status: "completed" },
        orderBy: { ranAt: "desc" },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByScenario(tenantId: TenantId, scenarioId: Uuid): Promise<SimulationRun[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.simulationRun.findMany({ where: { scenarioId } });
      return rows.map(toDomain);
    });
  }

  /** Everything that was explored on top of one forecast — what a withdrawal of it calls into doubt. */
  listByForecastRun(tenantId: TenantId, forecastRunId: Uuid): Promise<SimulationRun[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.simulationRun.findMany({ where: { forecastRunId } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<SimulationRun[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.simulationRun.findMany();
      return rows.map(toDomain);
    });
  }

  save(run: SimulationRun): Promise<void> {
    return withTenant(this.db, run.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(run);
      await tx.simulationRun.upsert({
        where: { id: run.id },
        create: { id: run.id, ...fields },
        update: fields,
      });
    });
  }
}
