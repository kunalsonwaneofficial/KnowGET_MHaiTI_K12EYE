import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";
import type {
  LeaveRequest,
  LeaveRequestRepository,
  LeaveStatus,
  LeaveType,
} from "@knowget/workforce";

interface LeaveRequestRow {
  id: string;
  tenantId: string;
  organizationId: string;
  employeeId: string;
  leaveType: string;
  period: string;
  days: number;
  startDate: string;
  endDate: string | null;
  reason: string | null;
  status: string;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: LeaveRequestRow): LeaveRequest {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    employeeId: row.employeeId as Uuid,
    leaveType: row.leaveType as LeaveType,
    period: row.period,
    days: row.days,
    startDate: row.startDate,
    endDate: row.endDate,
    reason: row.reason,
    status: row.status as LeaveStatus,
    decidedBy: (row.decidedBy as Uuid | null) ?? null,
    decidedAt: row.decidedAt,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(request: LeaveRequest) {
  return {
    tenantId: request.tenantId,
    organizationId: request.organizationId,
    employeeId: request.employeeId,
    leaveType: request.leaveType,
    period: request.period,
    days: request.days,
    startDate: request.startDate,
    endDate: request.endDate,
    reason: request.reason,
    status: request.status,
    decidedBy: request.decidedBy,
    decidedAt: request.decidedAt,
  };
}

/** Prisma-backed {@link LeaveRequestRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaLeaveRequestRepository implements LeaveRequestRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<LeaveRequest | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.leaveRequest.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<LeaveRequest[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.leaveRequest.findMany({ where: { employeeId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<LeaveRequest[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.leaveRequest.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(request: LeaveRequest): Promise<void> {
    return withTenant(this.db, request.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(request);
      await tx.leaveRequest.upsert({
        where: { id: request.id },
        create: { id: request.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.leaveRequest.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
