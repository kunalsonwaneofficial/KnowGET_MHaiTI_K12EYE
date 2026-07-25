import type {
  Leave,
  LeaveRepository,
  LeaveStatus,
  LeaveType,
  ParticipantType,
  SupportingDocument,
} from "@knowget/attendance-presence";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface LeaveRow {
  id: string;
  tenantId: string;
  organizationId: string;
  personId: string;
  holderType: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  reason: string;
  supportingDocuments: unknown;
  status: string;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  decisionNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: LeaveRow): Leave {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    personId: row.personId as Uuid,
    holderType: row.holderType as ParticipantType,
    leaveType: row.leaveType as LeaveType,
    fromDate: row.fromDate,
    toDate: row.toDate,
    reason: row.reason,
    supportingDocuments: (row.supportingDocuments as SupportingDocument[]) ?? [],
    status: row.status as LeaveStatus,
    reviewedBy: (row.reviewedBy as Uuid | null) ?? null,
    reviewedAt: row.reviewedAt ? toIso(row.reviewedAt) : null,
    decisionNote: row.decisionNote,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(leave: Leave) {
  return {
    tenantId: leave.tenantId,
    organizationId: leave.organizationId,
    personId: leave.personId,
    holderType: leave.holderType,
    leaveType: leave.leaveType,
    fromDate: leave.fromDate,
    toDate: leave.toDate,
    reason: leave.reason,
    supportingDocuments: JSON.parse(JSON.stringify(leave.supportingDocuments)),
    status: leave.status,
    reviewedBy: leave.reviewedBy,
    reviewedAt: leave.reviewedAt ? new Date(leave.reviewedAt) : null,
    decisionNote: leave.decisionNote,
  };
}

/** Prisma-backed {@link LeaveRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaLeaveRepository implements LeaveRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Leave | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.leave.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByPerson(tenantId: TenantId, personId: Uuid): Promise<Leave[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.leave.findMany({ where: { personId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Leave[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.leave.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Leave[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.leave.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(leave: Leave): Promise<void> {
    return withTenant(this.db, leave.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(leave);
      await tx.leave.upsert({
        where: { id: leave.id },
        create: { id: leave.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.leave.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
