import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { Sensor, SensorMetric, SensorRepository, SensorStatus } from "@knowget/facilities";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface SensorRow {
  id: string;
  tenantId: string;
  organizationId: string;
  buildingId: string;
  spaceId: string;
  code: string;
  metric: string;
  unit: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: SensorRow): Sensor {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    buildingId: row.buildingId as Uuid,
    spaceId: row.spaceId as Uuid,
    code: row.code,
    metric: row.metric as SensorMetric,
    unit: row.unit,
    status: row.status as SensorStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(sensor: Sensor) {
  return {
    tenantId: sensor.tenantId,
    organizationId: sensor.organizationId,
    buildingId: sensor.buildingId,
    spaceId: sensor.spaceId,
    code: sensor.code,
    metric: sensor.metric,
    unit: sensor.unit,
    status: sensor.status,
  };
}

/** Prisma-backed {@link SensorRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaSensorRepository implements SensorRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Sensor | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.sensor.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(tenantId: TenantId, code: string): Promise<Sensor | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.sensor.findFirst({ where: { code, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findActiveBySpaceAndMetric(
    tenantId: TenantId,
    spaceId: Uuid,
    metric: string,
  ): Promise<Sensor | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.sensor.findFirst({
        where: { spaceId, metric, status: "active", deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listBySpace(tenantId: TenantId, spaceId: Uuid): Promise<Sensor[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.sensor.findMany({ where: { spaceId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByBuilding(tenantId: TenantId, buildingId: Uuid): Promise<Sensor[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.sensor.findMany({ where: { buildingId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Sensor[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.sensor.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Sensor[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.sensor.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(sensor: Sensor): Promise<void> {
    return withTenant(this.db, sensor.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(sensor);
      await tx.sensor.upsert({
        where: { id: sensor.id },
        create: { id: sensor.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.sensor.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
