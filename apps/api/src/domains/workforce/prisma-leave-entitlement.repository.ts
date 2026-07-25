import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";
import type { LeaveEntitlement, LeaveEntitlementRepository, LeaveType } from "@knowget/workforce";

interface LeaveEntitlementRow {
  id: string;
  tenantId: string;
  organizationId: string;
  employeeId: string;
  leaveType: string;
  period: string;
  entitledDays: number;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: LeaveEntitlementRow): LeaveEntitlement {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    employeeId: row.employeeId as Uuid,
    leaveType: row.leaveType as LeaveType,
    period: row.period,
    entitledDays: row.entitledDays,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(entitlement: LeaveEntitlement) {
  return {
    tenantId: entitlement.tenantId,
    organizationId: entitlement.organizationId,
    employeeId: entitlement.employeeId,
    leaveType: entitlement.leaveType,
    period: entitlement.period,
    entitledDays: entitlement.entitledDays,
  };
}

/** Prisma-backed {@link LeaveEntitlementRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaLeaveEntitlementRepository implements LeaveEntitlementRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<LeaveEntitlement | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.leaveEntitlement.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByScope(
    tenantId: TenantId,
    employeeId: Uuid,
    leaveType: string,
    period: string,
  ): Promise<LeaveEntitlement | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.leaveEntitlement.findFirst({
        where: { employeeId, leaveType, period, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<LeaveEntitlement[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.leaveEntitlement.findMany({ where: { employeeId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<LeaveEntitlement[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.leaveEntitlement.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(entitlement: LeaveEntitlement): Promise<void> {
    return withTenant(this.db, entitlement.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(entitlement);
      await tx.leaveEntitlement.upsert({
        where: { id: entitlement.id },
        create: { id: entitlement.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.leaveEntitlement.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
