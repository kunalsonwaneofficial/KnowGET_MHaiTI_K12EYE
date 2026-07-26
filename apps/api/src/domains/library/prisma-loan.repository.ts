import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { Loan, LoanRepository, LoanStatus } from "@knowget/library";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface LoanRow {
  id: string;
  tenantId: string;
  organizationId: string;
  copyId: string;
  titleId: string;
  memberId: string;
  issueDate: string;
  loanPeriodDays: number;
  renewalLimit: number;
  renewalsUsed: number;
  returnedDate: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: LoanRow): Loan {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    copyId: row.copyId as Uuid,
    titleId: row.titleId as Uuid,
    memberId: row.memberId as Uuid,
    issueDate: row.issueDate,
    loanPeriodDays: row.loanPeriodDays,
    renewalLimit: row.renewalLimit,
    renewalsUsed: row.renewalsUsed,
    returnedDate: row.returnedDate,
    status: row.status as LoanStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(loan: Loan) {
  return {
    tenantId: loan.tenantId,
    organizationId: loan.organizationId,
    copyId: loan.copyId,
    titleId: loan.titleId,
    memberId: loan.memberId,
    issueDate: loan.issueDate,
    loanPeriodDays: loan.loanPeriodDays,
    renewalLimit: loan.renewalLimit,
    renewalsUsed: loan.renewalsUsed,
    returnedDate: loan.returnedDate,
    status: loan.status,
  };
}

/** Prisma-backed {@link LoanRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaLoanRepository implements LoanRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Loan | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.loan.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findActiveByCopy(tenantId: TenantId, copyId: Uuid): Promise<Loan | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.loan.findFirst({
        where: { copyId, status: "active", deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listActiveByMember(tenantId: TenantId, memberId: Uuid): Promise<Loan[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.loan.findMany({
        where: { memberId, status: "active", deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByMember(tenantId: TenantId, memberId: Uuid): Promise<Loan[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.loan.findMany({ where: { memberId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByCopy(tenantId: TenantId, copyId: Uuid): Promise<Loan[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.loan.findMany({ where: { copyId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Loan[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.loan.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Loan[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.loan.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(loan: Loan): Promise<void> {
    return withTenant(this.db, loan.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(loan);
      await tx.loan.upsert({
        where: { id: loan.id },
        create: { id: loan.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.loan.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
