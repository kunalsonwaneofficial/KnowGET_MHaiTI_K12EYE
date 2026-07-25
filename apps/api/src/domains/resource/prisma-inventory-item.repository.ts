import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { InventoryItem, InventoryItemRepository, ItemStatus } from "@knowget/resource";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface InventoryItemRow {
  id: string;
  tenantId: string;
  organizationId: string;
  sku: string;
  name: string;
  category: string | null;
  unitOfMeasure: string;
  reorderLevel: number;
  standardCostMinor: bigint | null;
  currency: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: InventoryItemRow): InventoryItem {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    sku: row.sku,
    name: row.name,
    category: row.category,
    unitOfMeasure: row.unitOfMeasure,
    reorderLevel: row.reorderLevel,
    standardCostMinor: row.standardCostMinor === null ? null : Number(row.standardCostMinor),
    currency: row.currency,
    status: row.status as ItemStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(item: InventoryItem) {
  return {
    tenantId: item.tenantId,
    organizationId: item.organizationId,
    sku: item.sku,
    name: item.name,
    category: item.category,
    unitOfMeasure: item.unitOfMeasure,
    reorderLevel: item.reorderLevel,
    standardCostMinor: item.standardCostMinor === null ? null : BigInt(item.standardCostMinor),
    currency: item.currency,
    status: item.status,
  };
}

/** Prisma-backed {@link InventoryItemRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaInventoryItemRepository implements InventoryItemRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<InventoryItem | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.inventoryItem.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findBySku(tenantId: TenantId, sku: string): Promise<InventoryItem | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.inventoryItem.findFirst({ where: { sku, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<InventoryItem[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.inventoryItem.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<InventoryItem[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.inventoryItem.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(item: InventoryItem): Promise<void> {
    return withTenant(this.db, item.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(item);
      await tx.inventoryItem.upsert({
        where: { id: item.id },
        create: { id: item.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.inventoryItem.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
