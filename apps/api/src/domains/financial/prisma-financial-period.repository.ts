import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { FinancialPeriod, FinancialPeriodRepository, PeriodStatus } from "@knowget/financial";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface FinancialPeriodRow {
  id: string;
  tenantId: string;
  organizationId: string;
  code: string;
  label: string;
  startDate: string;
  endDate: string;
  status: string;
  closedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: FinancialPeriodRow): FinancialPeriod {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    code: row.code,
    label: row.label,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status as PeriodStatus,
    closedAt: (row.closedAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(period: FinancialPeriod) {
  return {
    tenantId: period.tenantId,
    organizationId: period.organizationId,
    code: period.code,
    label: period.label,
    startDate: period.startDate,
    endDate: period.endDate,
    status: period.status,
    closedAt: period.closedAt,
  };
}

/** Prisma-backed {@link FinancialPeriodRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaFinancialPeriodRepository implements FinancialPeriodRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<FinancialPeriod | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.financialPeriod.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(tenantId: TenantId, code: string): Promise<FinancialPeriod | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.financialPeriod.findFirst({ where: { code, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<FinancialPeriod[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.financialPeriod.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<FinancialPeriod[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.financialPeriod.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(period: FinancialPeriod): Promise<void> {
    return withTenant(this.db, period.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(period);
      await tx.financialPeriod.upsert({
        where: { id: period.id },
        create: { id: period.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.financialPeriod.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
