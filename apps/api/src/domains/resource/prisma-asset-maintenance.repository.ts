import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  AssetMaintenance,
  AssetMaintenanceRepository,
  MaintenanceStatus,
} from "@knowget/resource";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface AssetMaintenanceRow {
  id: string;
  tenantId: string;
  organizationId: string;
  assetId: string;
  description: string;
  scheduledDate: string | null;
  performedDate: string | null;
  costMinor: bigint | null;
  currency: string | null;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AssetMaintenanceRow): AssetMaintenance {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    assetId: row.assetId as Uuid,
    description: row.description,
    scheduledDate: row.scheduledDate,
    performedDate: row.performedDate,
    costMinor: row.costMinor === null ? null : Number(row.costMinor),
    currency: row.currency,
    status: row.status as MaintenanceStatus,
    notes: row.notes,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(maintenance: AssetMaintenance) {
  return {
    tenantId: maintenance.tenantId,
    organizationId: maintenance.organizationId,
    assetId: maintenance.assetId,
    description: maintenance.description,
    scheduledDate: maintenance.scheduledDate,
    performedDate: maintenance.performedDate,
    costMinor: maintenance.costMinor === null ? null : BigInt(maintenance.costMinor),
    currency: maintenance.currency,
    status: maintenance.status,
    notes: maintenance.notes,
  };
}

/** Prisma-backed {@link AssetMaintenanceRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaAssetMaintenanceRepository implements AssetMaintenanceRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<AssetMaintenance | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.assetMaintenance.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByAsset(tenantId: TenantId, assetId: Uuid): Promise<AssetMaintenance[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.assetMaintenance.findMany({ where: { assetId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<AssetMaintenance[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.assetMaintenance.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(maintenance: AssetMaintenance): Promise<void> {
    return withTenant(this.db, maintenance.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(maintenance);
      await tx.assetMaintenance.upsert({
        where: { id: maintenance.id },
        create: { id: maintenance.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.assetMaintenance.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
