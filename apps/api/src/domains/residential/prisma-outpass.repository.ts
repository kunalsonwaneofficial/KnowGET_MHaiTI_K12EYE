import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { Outpass, OutpassRepository, OutpassStatus, OutpassType } from "@knowget/residential";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

const OPEN_OUTPASS_STATUSES = ["requested", "approved", "checked_out"];

interface OutpassRow {
  id: string;
  tenantId: string;
  organizationId: string;
  hostelId: string;
  studentId: string;
  type: string;
  reason: string | null;
  expectedOutAt: string;
  expectedInAt: string;
  actualOutAt: string | null;
  actualInAt: string | null;
  approvedBy: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: OutpassRow): Outpass {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    hostelId: row.hostelId as Uuid,
    studentId: row.studentId as Uuid,
    type: row.type as OutpassType,
    reason: row.reason,
    expectedOutAt: row.expectedOutAt,
    expectedInAt: row.expectedInAt,
    actualOutAt: row.actualOutAt,
    actualInAt: row.actualInAt,
    approvedBy: (row.approvedBy as Uuid | null) ?? null,
    status: row.status as OutpassStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(outpass: Outpass) {
  return {
    tenantId: outpass.tenantId,
    organizationId: outpass.organizationId,
    hostelId: outpass.hostelId,
    studentId: outpass.studentId,
    type: outpass.type,
    reason: outpass.reason,
    expectedOutAt: outpass.expectedOutAt,
    expectedInAt: outpass.expectedInAt,
    actualOutAt: outpass.actualOutAt,
    actualInAt: outpass.actualInAt,
    approvedBy: outpass.approvedBy,
    status: outpass.status,
  };
}

/** Prisma-backed {@link OutpassRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaOutpassRepository implements OutpassRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Outpass | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.outpass.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findOpenByStudent(tenantId: TenantId, studentId: Uuid): Promise<Outpass | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.outpass.findFirst({
        where: { studentId, status: { in: OPEN_OUTPASS_STATUSES }, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<Outpass[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.outpass.findMany({ where: { studentId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByHostel(tenantId: TenantId, hostelId: Uuid): Promise<Outpass[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.outpass.findMany({ where: { hostelId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listOpenByHostel(tenantId: TenantId, hostelId: Uuid): Promise<Outpass[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.outpass.findMany({
        where: { hostelId, status: { in: OPEN_OUTPASS_STATUSES }, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Outpass[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.outpass.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Outpass[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.outpass.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(outpass: Outpass): Promise<void> {
    return withTenant(this.db, outpass.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(outpass);
      await tx.outpass.upsert({
        where: { id: outpass.id },
        create: { id: outpass.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.outpass.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
