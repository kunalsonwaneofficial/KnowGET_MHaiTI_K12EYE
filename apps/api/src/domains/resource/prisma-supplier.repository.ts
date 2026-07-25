import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { Supplier, SupplierRepository, SupplierStatus } from "@knowget/resource";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface SupplierRow {
  id: string;
  tenantId: string;
  organizationId: string;
  code: string;
  name: string;
  category: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: SupplierRow): Supplier {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    code: row.code,
    name: row.name,
    category: row.category,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    status: row.status as SupplierStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(supplier: Supplier) {
  return {
    tenantId: supplier.tenantId,
    organizationId: supplier.organizationId,
    code: supplier.code,
    name: supplier.name,
    category: supplier.category,
    contactEmail: supplier.contactEmail,
    contactPhone: supplier.contactPhone,
    status: supplier.status,
  };
}

/** Prisma-backed {@link SupplierRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaSupplierRepository implements SupplierRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Supplier | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.supplier.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(tenantId: TenantId, code: string): Promise<Supplier | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.supplier.findFirst({ where: { code, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Supplier[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.supplier.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Supplier[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.supplier.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(supplier: Supplier): Promise<void> {
    return withTenant(this.db, supplier.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(supplier);
      await tx.supplier.upsert({
        where: { id: supplier.id },
        create: { id: supplier.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.supplier.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
