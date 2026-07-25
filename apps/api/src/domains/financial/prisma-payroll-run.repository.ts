import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { PayrollRun, PayrollRunRepository, PayrollRunStatus } from "@knowget/financial";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface PayrollRunRow {
  id: string;
  tenantId: string;
  organizationId: string;
  periodId: string | null;
  label: string;
  currency: string;
  status: string;
  processedAt: string | null;
  paidAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: PayrollRunRow): PayrollRun {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    periodId: (row.periodId as Uuid | null) ?? null,
    label: row.label,
    currency: row.currency,
    status: row.status as PayrollRunStatus,
    processedAt: (row.processedAt as ISODateString | null) ?? null,
    paidAt: (row.paidAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(run: PayrollRun) {
  return {
    tenantId: run.tenantId,
    organizationId: run.organizationId,
    periodId: run.periodId,
    label: run.label,
    currency: run.currency,
    status: run.status,
    processedAt: run.processedAt,
    paidAt: run.paidAt,
  };
}

/** Prisma-backed {@link PayrollRunRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaPayrollRunRepository implements PayrollRunRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<PayrollRun | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.payrollRun.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<PayrollRun[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.payrollRun.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<PayrollRun[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.payrollRun.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(run: PayrollRun): Promise<void> {
    return withTenant(this.db, run.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(run);
      await tx.payrollRun.upsert({
        where: { id: run.id },
        create: { id: run.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.payrollRun.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
