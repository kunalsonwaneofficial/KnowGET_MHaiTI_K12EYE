import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { PayComponent, Payslip, PayslipRepository, PayslipStatus } from "@knowget/financial";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface PayslipRow {
  id: string;
  tenantId: string;
  organizationId: string;
  payrollRunId: string;
  employeeId: string;
  currency: string;
  earnings: unknown;
  deductions: unknown;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: PayslipRow): Payslip {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    payrollRunId: row.payrollRunId as Uuid,
    employeeId: row.employeeId as Uuid,
    currency: row.currency,
    earnings: (row.earnings as PayComponent[]) ?? [],
    deductions: (row.deductions as PayComponent[]) ?? [],
    status: row.status as PayslipStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(payslip: Payslip) {
  return {
    tenantId: payslip.tenantId,
    organizationId: payslip.organizationId,
    payrollRunId: payslip.payrollRunId,
    employeeId: payslip.employeeId,
    currency: payslip.currency,
    earnings: JSON.parse(JSON.stringify(payslip.earnings)),
    deductions: JSON.parse(JSON.stringify(payslip.deductions)),
    status: payslip.status,
  };
}

/** Prisma-backed {@link PayslipRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaPayslipRepository implements PayslipRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Payslip | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.payslip.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByRunAndEmployee(
    tenantId: TenantId,
    payrollRunId: Uuid,
    employeeId: Uuid,
  ): Promise<Payslip | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.payslip.findFirst({
        where: { payrollRunId, employeeId, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByRun(tenantId: TenantId, payrollRunId: Uuid): Promise<Payslip[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.payslip.findMany({ where: { payrollRunId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<Payslip[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.payslip.findMany({ where: { employeeId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Payslip[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.payslip.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(payslip: Payslip): Promise<void> {
    return withTenant(this.db, payslip.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(payslip);
      await tx.payslip.upsert({
        where: { id: payslip.id },
        create: { id: payslip.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.payslip.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
