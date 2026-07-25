import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  AccountStanding,
  StudentFinancialAccount,
  StudentFinancialAccountRepository,
} from "@knowget/financial";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface StudentFinancialAccountRow {
  id: string;
  tenantId: string;
  organizationId: string;
  studentId: string;
  currency: string;
  totalBilledMinor: bigint;
  totalPaidMinor: bigint;
  outstandingMinor: bigint;
  overdueMinor: bigint;
  chargeCount: number;
  standing: string;
  version: number;
  refreshedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: StudentFinancialAccountRow): StudentFinancialAccount {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    studentId: row.studentId as Uuid,
    currency: row.currency,
    totalBilledMinor: Number(row.totalBilledMinor),
    totalPaidMinor: Number(row.totalPaidMinor),
    outstandingMinor: Number(row.outstandingMinor),
    overdueMinor: Number(row.overdueMinor),
    chargeCount: row.chargeCount,
    standing: row.standing as AccountStanding,
    version: row.version,
    refreshedAt: (row.refreshedAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(account: StudentFinancialAccount) {
  return {
    tenantId: account.tenantId,
    organizationId: account.organizationId,
    studentId: account.studentId,
    currency: account.currency,
    totalBilledMinor: BigInt(account.totalBilledMinor),
    totalPaidMinor: BigInt(account.totalPaidMinor),
    outstandingMinor: BigInt(account.outstandingMinor),
    overdueMinor: BigInt(account.overdueMinor),
    chargeCount: account.chargeCount,
    standing: account.standing,
    version: account.version,
    refreshedAt: account.refreshedAt,
  };
}

/** Prisma-backed {@link StudentFinancialAccountRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaStudentFinancialAccountRepository implements StudentFinancialAccountRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<StudentFinancialAccount | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.studentFinancialAccount.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByStudent(tenantId: TenantId, studentId: Uuid): Promise<StudentFinancialAccount | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.studentFinancialAccount.findFirst({
        where: { studentId, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<StudentFinancialAccount[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.studentFinancialAccount.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<StudentFinancialAccount[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.studentFinancialAccount.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(account: StudentFinancialAccount): Promise<void> {
    return withTenant(this.db, account.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(account);
      await tx.studentFinancialAccount.upsert({
        where: { id: account.id },
        create: { id: account.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.studentFinancialAccount.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });
  }
}
