import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  PurchaseRequisition,
  PurchaseRequisitionRepository,
  RequisitionLine,
  RequisitionStatus,
} from "@knowget/resource";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface PurchaseRequisitionRow {
  id: string;
  tenantId: string;
  organizationId: string;
  requesterId: string;
  title: string;
  justification: string | null;
  currency: string;
  lines: unknown;
  status: string;
  reviewNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: PurchaseRequisitionRow): PurchaseRequisition {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    requesterId: row.requesterId as Uuid,
    title: row.title,
    justification: row.justification,
    currency: row.currency,
    lines: (row.lines as RequisitionLine[]) ?? [],
    status: row.status as RequisitionStatus,
    reviewNote: row.reviewNote,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(requisition: PurchaseRequisition) {
  return {
    tenantId: requisition.tenantId,
    organizationId: requisition.organizationId,
    requesterId: requisition.requesterId,
    title: requisition.title,
    justification: requisition.justification,
    currency: requisition.currency,
    lines: JSON.parse(JSON.stringify(requisition.lines)),
    status: requisition.status,
    reviewNote: requisition.reviewNote,
  };
}

/** Prisma-backed {@link PurchaseRequisitionRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaPurchaseRequisitionRepository implements PurchaseRequisitionRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<PurchaseRequisition | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.purchaseRequisition.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByRequester(tenantId: TenantId, requesterId: Uuid): Promise<PurchaseRequisition[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.purchaseRequisition.findMany({
        where: { requesterId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<PurchaseRequisition[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.purchaseRequisition.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<PurchaseRequisition[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.purchaseRequisition.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(requisition: PurchaseRequisition): Promise<void> {
    return withTenant(this.db, requisition.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(requisition);
      await tx.purchaseRequisition.upsert({
        where: { id: requisition.id },
        create: { id: requisition.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.purchaseRequisition.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
