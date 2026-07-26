import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { Warden, WardenRepository, WardenRole, WardenStatus } from "@knowget/residential";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface WardenRow {
  id: string;
  tenantId: string;
  organizationId: string;
  employeeId: string;
  role: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: WardenRow): Warden {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    employeeId: row.employeeId as Uuid,
    role: row.role as WardenRole,
    status: row.status as WardenStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(warden: Warden) {
  return {
    tenantId: warden.tenantId,
    organizationId: warden.organizationId,
    employeeId: warden.employeeId,
    role: warden.role,
    status: warden.status,
  };
}

/** Prisma-backed {@link WardenRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaWardenRepository implements WardenRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Warden | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.warden.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<Warden | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.warden.findFirst({ where: { employeeId, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Warden[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.warden.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Warden[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.warden.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(warden: Warden): Promise<void> {
    return withTenant(this.db, warden.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(warden);
      await tx.warden.upsert({
        where: { id: warden.id },
        create: { id: warden.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.warden.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
