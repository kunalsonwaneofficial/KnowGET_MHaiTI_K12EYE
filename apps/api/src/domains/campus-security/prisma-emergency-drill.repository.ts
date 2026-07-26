import type {
  DrillStatus,
  DrillType,
  EmergencyDrill,
  EmergencyDrillRepository,
} from "@knowget/campus-security";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface EmergencyDrillRow {
  id: string;
  tenantId: string;
  organizationId: string;
  code: string;
  type: string;
  zoneId: string | null;
  conductedById: string | null;
  scheduledFor: string;
  expectedCount: number;
  accountedCount: number;
  startedAt: string | null;
  completedAt: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: EmergencyDrillRow): EmergencyDrill {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    code: row.code,
    type: row.type as DrillType,
    zoneId: (row.zoneId as Uuid | null) ?? null,
    conductedById: (row.conductedById as Uuid | null) ?? null,
    scheduledFor: row.scheduledFor,
    expectedCount: row.expectedCount,
    accountedCount: row.accountedCount,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    status: row.status as DrillStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(drill: EmergencyDrill) {
  return {
    tenantId: drill.tenantId,
    organizationId: drill.organizationId,
    code: drill.code,
    type: drill.type,
    zoneId: drill.zoneId,
    conductedById: drill.conductedById,
    scheduledFor: drill.scheduledFor,
    expectedCount: drill.expectedCount,
    accountedCount: drill.accountedCount,
    startedAt: drill.startedAt,
    completedAt: drill.completedAt,
    status: drill.status,
  };
}

/** Prisma-backed {@link EmergencyDrillRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaEmergencyDrillRepository implements EmergencyDrillRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<EmergencyDrill | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.emergencyDrill.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(tenantId: TenantId, code: string): Promise<EmergencyDrill | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.emergencyDrill.findFirst({ where: { code, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByZone(tenantId: TenantId, zoneId: Uuid): Promise<EmergencyDrill[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.emergencyDrill.findMany({ where: { zoneId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<EmergencyDrill[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.emergencyDrill.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<EmergencyDrill[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.emergencyDrill.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(drill: EmergencyDrill): Promise<void> {
    return withTenant(this.db, drill.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(drill);
      await tx.emergencyDrill.upsert({
        where: { id: drill.id },
        create: { id: drill.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.emergencyDrill.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
