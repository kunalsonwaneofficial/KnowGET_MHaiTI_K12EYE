import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  EnvironmentReading,
  EnvironmentReadingRepository,
  SensorMetric,
} from "@knowget/facilities";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface EnvironmentReadingRow {
  id: string;
  tenantId: string;
  organizationId: string;
  buildingId: string;
  spaceId: string;
  sensorId: string;
  metric: string;
  value: number;
  unit: string | null;
  recordedAt: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: EnvironmentReadingRow): EnvironmentReading {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    buildingId: row.buildingId as Uuid,
    spaceId: row.spaceId as Uuid,
    sensorId: row.sensorId as Uuid,
    metric: row.metric as SensorMetric,
    value: row.value,
    unit: row.unit,
    recordedAt: row.recordedAt,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(reading: EnvironmentReading) {
  return {
    tenantId: reading.tenantId,
    organizationId: reading.organizationId,
    buildingId: reading.buildingId,
    spaceId: reading.spaceId,
    sensorId: reading.sensorId,
    metric: reading.metric,
    value: reading.value,
    unit: reading.unit,
    recordedAt: reading.recordedAt,
  };
}

/**
 * Prisma-backed {@link EnvironmentReadingRepository} (RLS via {@link withTenant}). Readings are immutable and
 * append-only, so there is no `remove`. `latestBySpace` reads the readings newest-first and keeps the first
 * per metric — the latest per (space, metric) — which is exactly the comfort engine's input.
 */
export class PrismaEnvironmentReadingRepository implements EnvironmentReadingRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<EnvironmentReading | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.environmentReading.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listBySpace(tenantId: TenantId, spaceId: Uuid): Promise<EnvironmentReading[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.environmentReading.findMany({ where: { spaceId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listBySensor(tenantId: TenantId, sensorId: Uuid): Promise<EnvironmentReading[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.environmentReading.findMany({ where: { sensorId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  latestBySpace(tenantId: TenantId, spaceId: Uuid): Promise<EnvironmentReading[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.environmentReading.findMany({
        where: { spaceId, deletedAt: null },
        orderBy: { recordedAt: "desc" },
      });
      const latest = new Map<string, EnvironmentReadingRow>();
      for (const row of rows) {
        if (!latest.has(row.metric)) {
          latest.set(row.metric, row);
        }
      }
      return [...latest.values()].map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<EnvironmentReading[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.environmentReading.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(reading: EnvironmentReading): Promise<void> {
    return withTenant(this.db, reading.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(reading);
      await tx.environmentReading.upsert({
        where: { id: reading.id },
        create: { id: reading.id, ...fields },
        update: fields,
      });
    });
  }
}
