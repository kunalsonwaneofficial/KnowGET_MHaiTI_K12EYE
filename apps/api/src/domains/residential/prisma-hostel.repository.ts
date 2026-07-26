import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { Hostel, HostelRepository, HostelStatus, HostelType } from "@knowget/residential";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface HostelRow {
  id: string;
  tenantId: string;
  organizationId: string;
  code: string;
  name: string;
  type: string;
  wardenId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: HostelRow): Hostel {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    code: row.code,
    name: row.name,
    type: row.type as HostelType,
    wardenId: (row.wardenId as Uuid | null) ?? null,
    status: row.status as HostelStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(hostel: Hostel) {
  return {
    tenantId: hostel.tenantId,
    organizationId: hostel.organizationId,
    code: hostel.code,
    name: hostel.name,
    type: hostel.type,
    wardenId: hostel.wardenId,
    status: hostel.status,
  };
}

/** Prisma-backed {@link HostelRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaHostelRepository implements HostelRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Hostel | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.hostel.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(tenantId: TenantId, code: string): Promise<Hostel | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.hostel.findFirst({ where: { code, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Hostel[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.hostel.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Hostel[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.hostel.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(hostel: Hostel): Promise<void> {
    return withTenant(this.db, hostel.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(hostel);
      await tx.hostel.upsert({
        where: { id: hostel.id },
        create: { id: hostel.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.hostel.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
