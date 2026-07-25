import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  OrderLine,
  PurchaseOrder,
  PurchaseOrderRepository,
  PurchaseOrderStatus,
} from "@knowget/resource";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface PurchaseOrderRow {
  id: string;
  tenantId: string;
  organizationId: string;
  supplierId: string;
  number: string;
  currency: string;
  requisitionId: string | null;
  expectedDate: string | null;
  lines: unknown;
  status: string;
  issuedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: PurchaseOrderRow): PurchaseOrder {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    supplierId: row.supplierId as Uuid,
    number: row.number,
    currency: row.currency,
    requisitionId: (row.requisitionId as Uuid | null) ?? null,
    expectedDate: row.expectedDate,
    lines: (row.lines as OrderLine[]) ?? [],
    status: row.status as PurchaseOrderStatus,
    issuedAt: (row.issuedAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(order: PurchaseOrder) {
  return {
    tenantId: order.tenantId,
    organizationId: order.organizationId,
    supplierId: order.supplierId,
    number: order.number,
    currency: order.currency,
    requisitionId: order.requisitionId,
    expectedDate: order.expectedDate,
    lines: JSON.parse(JSON.stringify(order.lines)),
    status: order.status,
    issuedAt: order.issuedAt,
  };
}

/** Prisma-backed {@link PurchaseOrderRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaPurchaseOrderRepository implements PurchaseOrderRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<PurchaseOrder | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.purchaseOrder.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByNumber(tenantId: TenantId, number: string): Promise<PurchaseOrder | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.purchaseOrder.findFirst({ where: { number, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listBySupplier(tenantId: TenantId, supplierId: Uuid): Promise<PurchaseOrder[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.purchaseOrder.findMany({ where: { supplierId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<PurchaseOrder[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.purchaseOrder.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<PurchaseOrder[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.purchaseOrder.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(order: PurchaseOrder): Promise<void> {
    return withTenant(this.db, order.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(order);
      await tx.purchaseOrder.upsert({
        where: { id: order.id },
        create: { id: order.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.purchaseOrder.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
