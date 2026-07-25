import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { InventoryPosition, InventoryPositionRepository } from "@knowget/resource";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface InventoryPositionRow {
  id: string;
  tenantId: string;
  organizationId: string;
  itemId: string;
  sku: string;
  onHandQuantity: number;
  receivedQuantity: number;
  issuedQuantity: number;
  adjustmentQuantity: number;
  reorderLevel: number;
  belowReorder: boolean;
  stockValueMinor: bigint | null;
  currency: string | null;
  version: number;
  refreshedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: InventoryPositionRow): InventoryPosition {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    itemId: row.itemId as Uuid,
    sku: row.sku,
    onHandQuantity: row.onHandQuantity,
    receivedQuantity: row.receivedQuantity,
    issuedQuantity: row.issuedQuantity,
    adjustmentQuantity: row.adjustmentQuantity,
    reorderLevel: row.reorderLevel,
    belowReorder: row.belowReorder,
    stockValueMinor: row.stockValueMinor === null ? null : Number(row.stockValueMinor),
    currency: row.currency,
    version: row.version,
    refreshedAt: (row.refreshedAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(position: InventoryPosition) {
  return {
    tenantId: position.tenantId,
    organizationId: position.organizationId,
    itemId: position.itemId,
    sku: position.sku,
    onHandQuantity: position.onHandQuantity,
    receivedQuantity: position.receivedQuantity,
    issuedQuantity: position.issuedQuantity,
    adjustmentQuantity: position.adjustmentQuantity,
    reorderLevel: position.reorderLevel,
    belowReorder: position.belowReorder,
    stockValueMinor: position.stockValueMinor === null ? null : BigInt(position.stockValueMinor),
    currency: position.currency,
    version: position.version,
    refreshedAt: position.refreshedAt,
  };
}

/** Prisma-backed {@link InventoryPositionRepository} (one per item; RLS via {@link withTenant}). */
export class PrismaInventoryPositionRepository implements InventoryPositionRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<InventoryPosition | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.inventoryPosition.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByItem(tenantId: TenantId, itemId: Uuid): Promise<InventoryPosition | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.inventoryPosition.findFirst({ where: { itemId, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<InventoryPosition[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.inventoryPosition.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<InventoryPosition[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.inventoryPosition.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(position: InventoryPosition): Promise<void> {
    return withTenant(this.db, position.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(position);
      await tx.inventoryPosition.upsert({
        where: { id: position.id },
        create: { id: position.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.inventoryPosition.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
