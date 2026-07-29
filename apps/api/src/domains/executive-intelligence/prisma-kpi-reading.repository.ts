import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type EvidenceCitation,
  type HealthPillar,
  type KpiReading,
  type KpiReadingRepository,
  type Measurement,
  type ReadingStanding,
} from "@knowget/executive-intelligence";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface KpiReadingRow {
  id: string;
  tenantId: string;
  organizationId: string;
  kpiDefinitionId: string;
  kpiKey: string;
  pillar: string;
  period: number;
  measurement: unknown;
  citations: unknown;
  standing: string;
  withdrawnAt: string | null;
  withdrawalReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: KpiReadingRow): KpiReading {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    kpiDefinitionId: row.kpiDefinitionId as Uuid,
    kpiKey: row.kpiKey,
    pillar: row.pillar as HealthPillar,
    period: row.period,
    measurement: row.measurement as Measurement,
    citations: (row.citations as EvidenceCitation[]) ?? [],
    standing: row.standing as ReadingStanding,
    withdrawnAt: (row.withdrawnAt as ISODateString | null) ?? null,
    withdrawalReason: row.withdrawalReason,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(reading: KpiReading) {
  return {
    tenantId: reading.tenantId,
    organizationId: reading.organizationId,
    kpiDefinitionId: reading.kpiDefinitionId,
    kpiKey: reading.kpiKey,
    pillar: reading.pillar,
    period: reading.period,
    measurement: JSON.parse(JSON.stringify(reading.measurement)),
    citations: JSON.parse(JSON.stringify(reading.citations)),
    standing: reading.standing,
    withdrawnAt: reading.withdrawnAt,
    withdrawalReason: reading.withdrawalReason,
  };
}

/**
 * Prisma-backed {@link KpiReadingRepository} (RLS via {@link withTenant}).
 *
 * The citations are a JSONB column on the reading and are loaded and saved with it. A reading cannot be
 * constructed without at least one usable citation — that is the whole of the contract's evidence rule — and a
 * child row that could be written, or deleted, on its own is exactly how an invariant of that kind stops being
 * one. The standing stored beside them is the weakest of their kinds, derived once on the way in, so a citation
 * moving without the reading moving would leave a figure describing itself as measured on the strength of
 * evidence that is no longer there.
 *
 * There is no `remove`, and the port declares none. A figure that should never have counted is withdrawn with a
 * reason, which is also what frees its period for the correction that replaces it.
 */
export class PrismaKpiReadingRepository implements KpiReadingRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<KpiReading | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.kpiReading.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  /**
   * Withdrawn readings are excluded on purpose, and the partial unique index behind this table draws the same
   * line. This read is what the service asks before filing a figure, so counting a withdrawn one would make the
   * institution invent a new period to file a correction into — which puts the correction somewhere nobody
   * looking at that period would ever find it.
   */
  findByKpiAndPeriod(
    tenantId: TenantId,
    kpiDefinitionId: Uuid,
    period: number,
  ): Promise<KpiReading | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.kpiReading.findFirst({
        where: { kpiDefinitionId, period, withdrawnAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  /**
   * The most recent standing reading for each indicator, whatever period that turns out to be. The pairing of
   * `orderBy` with `distinct` is load-bearing rather than decorative: ordering by indicator and then by
   * descending period makes the row kept per indicator the newest one.
   *
   * Age is deliberately not filtered here. How stale is too stale is the traceability engine's judgement, and a
   * repository that dropped old readings before the engine saw them would turn "this indicator last reported two
   * years ago" into "this indicator has never reported" — the same coverage gap with the one fact that would
   * tell somebody where to go removed from it.
   */
  listLatestPerKpi(tenantId: TenantId, organizationId: Uuid): Promise<KpiReading[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.kpiReading.findMany({
        where: { organizationId, withdrawnAt: null },
        orderBy: [{ kpiDefinitionId: "asc" }, { period: "desc" }],
        distinct: ["kpiDefinitionId"],
      });
      return rows.map(toDomain);
    });
  }

  /** One indicator's whole filed history, oldest first — withdrawn readings included, because they happened. */
  listByKpi(tenantId: TenantId, kpiDefinitionId: Uuid): Promise<KpiReading[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.kpiReading.findMany({
        where: { kpiDefinitionId },
        orderBy: { period: "asc" },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<KpiReading[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.kpiReading.findMany({
        orderBy: [{ kpiKey: "asc" }, { period: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  save(reading: KpiReading): Promise<void> {
    return withTenant(this.db, reading.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(reading);
      await tx.kpiReading.upsert({
        where: { id: reading.id },
        create: { id: reading.id, ...fields },
        update: fields,
      });
    });
  }
}
