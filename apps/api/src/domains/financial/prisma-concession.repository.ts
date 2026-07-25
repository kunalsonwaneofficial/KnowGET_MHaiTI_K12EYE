import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  Concession,
  ConcessionRepository,
  ConcessionStatus,
  ConcessionType,
} from "@knowget/financial";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface ConcessionRow {
  id: string;
  tenantId: string;
  organizationId: string;
  studentId: string;
  feeStructureId: string | null;
  type: string;
  percentage: number | null;
  amountMinor: bigint | null;
  currency: string | null;
  reason: string;
  status: string;
  reviewNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ConcessionRow): Concession {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    studentId: row.studentId as Uuid,
    feeStructureId: (row.feeStructureId as Uuid | null) ?? null,
    type: row.type as ConcessionType,
    percentage: row.percentage,
    amountMinor: row.amountMinor === null ? null : Number(row.amountMinor),
    currency: row.currency,
    reason: row.reason,
    status: row.status as ConcessionStatus,
    reviewNote: row.reviewNote,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(concession: Concession) {
  return {
    tenantId: concession.tenantId,
    organizationId: concession.organizationId,
    studentId: concession.studentId,
    feeStructureId: concession.feeStructureId,
    type: concession.type,
    percentage: concession.percentage,
    amountMinor: concession.amountMinor === null ? null : BigInt(concession.amountMinor),
    currency: concession.currency,
    reason: concession.reason,
    status: concession.status,
    reviewNote: concession.reviewNote,
  };
}

/** Prisma-backed {@link ConcessionRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaConcessionRepository implements ConcessionRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Concession | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.concession.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<Concession[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.concession.findMany({ where: { studentId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Concession[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.concession.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Concession[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.concession.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(concession: Concession): Promise<void> {
    return withTenant(this.db, concession.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(concession);
      await tx.concession.upsert({
        where: { id: concession.id },
        create: { id: concession.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.concession.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
