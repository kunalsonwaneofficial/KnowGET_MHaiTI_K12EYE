import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { Copy, CopyCondition, CopyRepository, CopyStatus } from "@knowget/library";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface CopyRow {
  id: string;
  tenantId: string;
  organizationId: string;
  titleId: string;
  barcode: string;
  location: string | null;
  condition: string;
  acquiredOn: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: CopyRow): Copy {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    titleId: row.titleId as Uuid,
    barcode: row.barcode,
    location: row.location,
    condition: row.condition as CopyCondition,
    acquiredOn: row.acquiredOn,
    status: row.status as CopyStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(copy: Copy) {
  return {
    tenantId: copy.tenantId,
    organizationId: copy.organizationId,
    titleId: copy.titleId,
    barcode: copy.barcode,
    location: copy.location,
    condition: copy.condition,
    acquiredOn: copy.acquiredOn,
    status: copy.status,
  };
}

/** Prisma-backed {@link CopyRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaCopyRepository implements CopyRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Copy | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.copy.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByBarcode(tenantId: TenantId, barcode: string): Promise<Copy | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.copy.findFirst({ where: { barcode, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByTitle(tenantId: TenantId, titleId: Uuid): Promise<Copy[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.copy.findMany({ where: { titleId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Copy[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.copy.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Copy[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.copy.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(copy: Copy): Promise<void> {
    return withTenant(this.db, copy.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(copy);
      await tx.copy.upsert({
        where: { id: copy.id },
        create: { id: copy.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.copy.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
