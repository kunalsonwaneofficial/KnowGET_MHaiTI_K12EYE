import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { MovementType, StockMovement, StockMovementRepository } from "@knowget/resource";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface StockMovementRow {
  id: string;
  tenantId: string;
  organizationId: string;
  itemId: string;
  type: string;
  quantity: number;
  reason: string | null;
  reference: string | null;
  occurredAt: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: StockMovementRow): StockMovement {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    itemId: row.itemId as Uuid,
    type: row.type as MovementType,
    quantity: row.quantity,
    reason: row.reason,
    reference: row.reference,
    occurredAt: row.occurredAt,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(movement: StockMovement) {
  return {
    tenantId: movement.tenantId,
    organizationId: movement.organizationId,
    itemId: movement.itemId,
    type: movement.type,
    quantity: movement.quantity,
    reason: movement.reason,
    reference: movement.reference,
    occurredAt: movement.occurredAt,
  };
}

/** Prisma-backed {@link StockMovementRepository} (append-only ledger; RLS via {@link withTenant}). */
export class PrismaStockMovementRepository implements StockMovementRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<StockMovement | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.stockMovement.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByItem(tenantId: TenantId, itemId: Uuid): Promise<StockMovement[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.stockMovement.findMany({ where: { itemId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<StockMovement[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.stockMovement.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<StockMovement[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.stockMovement.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(movement: StockMovement): Promise<void> {
    return withTenant(this.db, movement.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(movement);
      await tx.stockMovement.upsert({
        where: { id: movement.id },
        create: { id: movement.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.stockMovement.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
